/** The local pipeline adapter end to end: SQLite file, timer, HTTP server. */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_SERVE_OPTIONS, startPipeline } from "../src/local/server.ts";

const quiet = () => {};

describe("startPipeline", () => {
  test("serves /health, ticks on start, and keeps data across a restart", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "bd-local-"));
    // Fixture sources: the start-up tick runs every step and fetches nothing.
    const options = {
      dataDir,
      port: 0,
      tickSeconds: 3600,
      vars: {},
      sources: "fixtures" as const,
      log: quiet,
    };

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

  test("a request longer than Bun's 10-second idle timeout gets its answer", async () => {
    // /__tick waits for the whole run; a run with real sources can pass 10 s.
    const server = Bun.serve({
      ...LOCAL_SERVE_OPTIONS,
      port: 0,
      hostname: "127.0.0.1",
      fetch: async () => {
        await Bun.sleep(13_000);
        return new Response("done");
      },
    });
    try {
      expect(await (await fetch(`http://127.0.0.1:${server.port}/`)).text()).toBe("done");
    } finally {
      await server.stop(true);
    }
  }, 25_000);

  test("/__tick does not exist without a probe token", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "bd-local-"));
    const local = startPipeline({
      dataDir,
      port: 0,
      tickSeconds: 3600,
      vars: {},
      sources: "fixtures",
      log: quiet,
    });
    expect((await fetch(`${local.url}/__tick`)).status).toBe(404);
    await local.stop();
  });
});
