/** The local pipeline adapter end to end: SQLite file, timer, HTTP server. */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPipeline } from "../src/local/server.ts";

const quiet = () => {};

describe("startPipeline", () => {
  test("serves /health, ticks on start, and keeps data across a restart", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "bd-local-"));
    const options = { dataDir, port: 0, tickSeconds: 3600, vars: {}, log: quiet };

    const first = startPipeline(options);
    expect(first.url).toStartWith("http://127.0.0.1:");
    // The start-up tick runs the current slot; a second tick finds it done.
    await first.idle();
    const again = await first.pipeline.tick();
    expect(again).toMatchObject({ started: false, reason: "slot already ran" });
    const health = (await (await fetch(`${first.url}/health`)).json()) as {
      lastRun: { slot: string; started_at: number; status: string };
    };
    expect(health.lastRun.status).toBe("done");
    await first.stop();

    const second = startPipeline(options);
    const after = (await (await fetch(`${second.url}/health`)).json()) as {
      lastRun: { slot: string; started_at: number };
    };
    expect(after.lastRun).toMatchObject({
      slot: health.lastRun.slot,
      started_at: health.lastRun.started_at,
    });
    await second.stop();
  });

  test("/__tick does not exist without a probe token", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "bd-local-"));
    const local = startPipeline({ dataDir, port: 0, tickSeconds: 3600, vars: {}, log: quiet });
    expect((await fetch(`${local.url}/__tick`)).status).toBe(404);
    await local.stop();
  });
});
