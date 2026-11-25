/**
 * #49: local mode completes one assign and one summarize through the model
 * bridge. The pipeline is built from the local adapter's own parts (the
 * SQLite file in WAL mode with its migrations, the blob folder, the
 * recorded fixture sources), with the bridge as the only provider of both
 * chains in settings. Model calls go over real HTTP to the bridge, which
 * runs one process of the configured command per call.
 *
 * What is a stand-in, and why:
 * - The run is given stand-in prompts through `PipelineConfig.prompts`, the
 *   seam #42 made for them, in place of the shipped ones (assign since #43,
 *   summarize with #44). Each one carries the fake driver's answer for its
 *   input.
 * - The command is `apps/local/test/fake-agent.ts`, never a real agent CLI:
 *   it prints the answer its prompt carries. So this shows the bridge, the
 *   chain and the steps end to end; it does not show that a real agent
 *   answers a real prompt well (that is #43 and #44, with evals).
 *
 * Assertions compare ids, counts and statuses only, never fetched text
 * (invariant 6); the fixtures are scrubbed.
 */
import { Database as SQLite } from "bun:sqlite";
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBridge } from "../apps/local/bridge.ts";
import { createPipeline, pipelineConfig } from "../apps/pipeline/src/core/app.ts";
import type { AssignOutput } from "../apps/pipeline/src/core/assign.ts";
import { fixtureFetch } from "../apps/pipeline/src/core/fixture-sources.ts";
import { changeSettings } from "../apps/pipeline/src/core/settings.ts";
import type { SummarizeOutput } from "../apps/pipeline/src/core/summarize.ts";
import { directoryBlobs } from "../apps/pipeline/src/local/blobs.ts";
import { sqliteDatabase } from "../apps/pipeline/src/local/database.ts";
import { migrate } from "../apps/pipeline/src/local/migrate.ts";
import { readFixture } from "../apps/pipeline/src/local/server.ts";
import { drizzleOver } from "../packages/db/src/index.ts";
import { type DriverPrompts, fakeAssign, fakeSummarize } from "../packages/judge/src/index.ts";

const FAKE_AGENT = join(import.meta.dir, "../apps/local/test/fake-agent.ts");

/** Stand-in prompts: a system line, then the fake driver's answer for this input. */
const STAND_IN: DriverPrompts = {
  assign: (input) => [
    { role: "system", content: "Stand-in assign prompt (#43 writes the real one)." },
    { role: "user", content: `ANSWER: ${JSON.stringify(fakeAssign(input))}` },
  ],
  summarize: (input) => [
    { role: "system", content: "Stand-in summarize prompt (#44 writes the real one)." },
    { role: "user", content: `ANSWER: ${JSON.stringify(fakeSummarize(input))}` },
  ],
};

test("a local run assigns and summarizes through the bridge", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bd-bridge-run-"));
  const log = join(dir, "agent-calls.jsonl");
  // The tool-less flags a real command has are passed and ignored by the fake.
  const command = [process.execPath, FAKE_AGENT, "--log", log, "--tools", ""];
  const bridge = startBridge({ command, port: 0, timeoutMs: 30_000, log: () => {} });

  const sqlite = new SQLite(join(dir, "content.db"), { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL");
  migrate(sqlite);
  const db = sqliteDatabase(sqlite);
  const clock = { now: () => Date.now() };
  try {
    const provider = { name: "bridge", baseUrl: `${bridge.url}/v1`, model: "local-agent" };
    await changeSettings(drizzleOver(db), clock.now() - 1, {
      assignProviders: [provider],
      summarizeProviders: [provider],
    });
    const pipeline = createPipeline(
      {
        db,
        clock,
        blobs: directoryBlobs(join(dir, "blobs")),
        fetch: fixtureFetch(readFixture, clock.now),
      },
      { ...pipelineConfig({}), prompts: STAND_IN },
    );

    const result = await pipeline.tick();
    expect(result).toMatchObject({ status: "done" });

    const output = <T>(step: string) => {
      const row = sqlite.query("SELECT output FROM run_steps WHERE step = ?").get(step) as {
        output: string;
      };
      return JSON.parse(row.output) as T;
    };
    const assign = output<AssignOutput>("assign");
    expect(assign.skipped).toBeUndefined();
    expect(assign.failedBatches).toBe(0);
    expect(assign.assigned).toBeGreaterThan(0);
    const summarize = output<SummarizeOutput>("summarize");
    expect(summarize.skipped).toBeUndefined();
    expect(summarize.failed).toEqual([]);
    expect(summarize.drafted.length).toBeGreaterThan(0);

    // The published summaries name the bridge as their writer.
    const writers = sqlite.query("SELECT DISTINCT writer FROM summaries").all() as {
      writer: string;
    }[];
    expect(writers.map((w) => w.writer)).toEqual(["bridge"]);

    // One agent process per model call, each in its own empty folder, gone after.
    const calls = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { argv: string[]; cwd: string; cwdEntries: number });
    const batches = Math.ceil(assign.echoes / 10); // assignBatchSize's default
    expect(calls.length).toBe(batches + summarize.drafted.length);
    expect(new Set(calls.map((c) => c.cwd)).size).toBe(calls.length);
    for (const c of calls) {
      expect(c.argv).toEqual(command.slice(2));
      expect(c.cwdEntries).toBe(0);
      expect(existsSync(c.cwd)).toBe(false);
    }
  } finally {
    await bridge.stop();
    sqlite.close();
  }
}, 60_000);
