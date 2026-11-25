/**
 * Model usage records (#48): a summary names the provider, model and prompt
 * version that wrote it, and each run's model calls, with their tokens and
 * fallbacks, are rows that total per day.
 *
 * The runs use the recorded fixture sources and a stand-in model endpoint
 * that answers with the fake driver's output and a `usage` block. The
 * prompts are test-only (the input as JSON). Assertions compare ids, counts,
 * names and hosts only, never fetched text (invariant 6).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Provider } from "@bd/contracts";
import { drizzleOver } from "@bd/db";
import {
  type AssignInput,
  type DriverPrompts,
  fakeAssign,
  fakeSummarize,
  type SummarizeInput,
} from "@bd/judge";
import { createPipeline, pipelineConfig } from "../src/core/app.ts";
import type { AssignOutput } from "../src/core/assign.ts";
import { fixtureFetch } from "../src/core/fixture-sources.ts";
import { changeSettings } from "../src/core/settings.ts";
import { usageByDay } from "../src/core/usage.ts";
import { memoryBlobs, migratedDatabase, NOW, SLOT } from "./helpers.ts";

const FIXTURES = join(import.meta.dir, "../src/sources/fixtures");
const KEY = "test-usage-key-0003";

const PROMPTS: DriverPrompts = {
  assign: (input) => [{ role: "user", content: JSON.stringify(input) }],
  summarize: (input) => [{ role: "user", content: JSON.stringify(input) }],
  versions: { summarize: "summarize-test-1" },
};

const provider = (name: string): Provider => ({
  name,
  baseUrl: `https://${name}.test/v1`,
  model: `${name}-model`,
  apiKeyRef: "KEY",
});

/**
 * `down.test` answers 503; `assign.test` and `summarize.test` answer with
 * the fake's output and `usage` (assign: 100 + 20 tokens; summarize: 300 +
 * 50, no total).
 */
function modelEndpoint() {
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host === "down.test") return new Response("down", { status: 503 });
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    const data = JSON.parse(body.messages.at(-1)?.content ?? "null");
    const assign = url.host.startsWith("assign");
    const answer = assign ? fakeAssign(data as AssignInput) : fakeSummarize(data as SummarizeInput);
    const usage = assign
      ? { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      : { prompt_tokens: 300, completion_tokens: 50 };
    return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }], usage });
  };
  return impl as typeof fetch;
}

function setup() {
  const { db, sqlite } = migratedDatabase();
  const { blobs } = memoryBlobs();
  const now = NOW;
  const read = (file: string) => {
    try {
      return readFileSync(join(FIXTURES, file), "utf8");
    } catch {
      return null;
    }
  };
  const ports = {
    db,
    clock: { now: () => now },
    blobs,
    fetch: fixtureFetch(read, () => now),
    modelFetch: modelEndpoint(),
    secret: (name: string) => (name === "KEY" ? KEY : undefined),
  };
  const pipeline = (driver?: string) =>
    createPipeline(ports, {
      ...pipelineConfig(driver ? { MODEL_DRIVER: driver } : {}),
      prompts: PROMPTS,
    });
  const rows = <T>(sql: string, ...params: string[]) => sqlite.query(sql).all(...params) as T[];
  return {
    orm: drizzleOver(db),
    pipeline,
    rows,
  };
}

interface CallRow {
  task: string;
  provider: string;
  model: string;
  prompt_version: string | null;
  outcome: string;
  fallback: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

const CALLS = `SELECT task, provider, model, prompt_version, outcome, fallback,
  prompt_tokens, completion_tokens, total_tokens FROM model_calls WHERE slot = ? ORDER BY id`;

describe("model usage records", () => {
  test("a summary names its provider, model and prompt version; each call is a row", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW - 1, {
      assignProviders: [provider("assign")],
      summarizeProviders: [provider("down"), provider("summarize")],
    });
    expect(await t.pipeline().tick()).toMatchObject({ slot: SLOT, status: "done" });

    const summaries = t.rows<{ writer: string; model: string; prompt_version: string | null }>(
      "SELECT writer, model, prompt_version FROM summaries",
    );
    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) {
      expect(s).toEqual({
        writer: "summarize",
        model: "summarize-model",
        prompt_version: "summarize-test-1",
      });
    }

    const calls = t.rows<CallRow>(CALLS, SLOT);
    const assign = calls.filter((c) => c.task === "assign");
    expect(assign.length).toBeGreaterThan(0);
    for (const c of assign) {
      expect(c).toEqual({
        task: "assign",
        provider: "assign",
        model: "assign-model",
        prompt_version: null,
        outcome: "ok",
        fallback: 0,
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
      });
    }
    // Each wave: the first provider fails, the chain falls back to the next.
    const summarize = calls.filter((c) => c.task === "summarize");
    expect(summarize.length).toBe(summaries.length * 2);
    const brief = summarize.map((c) => [c.provider, c.outcome, c.fallback, c.prompt_tokens]);
    for (let i = 0; i < brief.length; i += 2) {
      expect(brief[i]).toEqual(["down", "error", 0, null]);
      expect(brief[i + 1]).toEqual(["summarize", "ok", 1, 300]);
    }

    // Totals per day.
    const day = SLOT.slice(0, 8);
    expect(await usageByDay(t.orm)).toEqual([
      {
        day,
        task: "assign",
        provider: "assign",
        model: "assign-model",
        calls: assign.length,
        failed: 0,
        fallbacks: 0,
        promptTokens: 100 * assign.length,
        completionTokens: 20 * assign.length,
        totalTokens: 120 * assign.length,
        withoutUsage: 0,
      },
      {
        day,
        task: "summarize",
        provider: "down",
        model: "down-model",
        calls: summaries.length,
        failed: summaries.length,
        fallbacks: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        withoutUsage: summaries.length,
      },
      {
        day,
        task: "summarize",
        provider: "summarize",
        model: "summarize-model",
        calls: summaries.length,
        failed: 0,
        fallbacks: summaries.length,
        promptTokens: 300 * summaries.length,
        completionTokens: 50 * summaries.length,
        totalTokens: 0,
        withoutUsage: summaries.length,
      },
    ]);
    expect(await usageByDay(t.orm, { fromDay: "20261120" })).toEqual([]);
    expect(await usageByDay(t.orm, { toDay: "20261118" })).toEqual([]);
    expect((await usageByDay(t.orm, { fromDay: day, toDay: day })).length).toBe(3);

    // No key in a usage row.
    const stored = JSON.stringify(t.rows("SELECT * FROM model_calls"));
    expect(stored.includes(KEY)).toBe(false);
  });

  test("a chain that fails records the calls it made, and the batch waits", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW - 1, {
      assignProviders: [provider("down")],
      summarizeProviders: [],
    });
    expect(await t.pipeline().tick()).toMatchObject({ slot: SLOT, status: "done" });
    const calls = t.rows<CallRow>(CALLS, SLOT);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.task === "assign" && c.outcome === "error")).toBe(true);
    const { failedBatches } = JSON.parse(
      t.rows<{ output: string }>(
        "SELECT output FROM run_steps WHERE slot = ? AND step = 'assign'",
        SLOT,
      )[0]?.output ?? "null",
    ) as AssignOutput;
    expect(calls.length).toBe(failedBatches);
  });

  test("the fake records one call per answer, so a local run shows its usage", async () => {
    const t = setup();
    expect(await t.pipeline("fake").tick()).toMatchObject({ slot: SLOT, status: "done" });
    const summaries = t.rows<{ writer: string; model: string; prompt_version: string | null }>(
      "SELECT DISTINCT writer, model, prompt_version FROM summaries",
    );
    expect(summaries).toEqual([{ writer: "fake", model: "fake", prompt_version: null }]);
    const usage = await usageByDay(t.orm);
    expect(usage.map((u) => [u.task, u.provider, u.failed, u.withoutUsage === u.calls])).toEqual([
      ["assign", "fake", 0, true],
      ["summarize", "fake", 0, true],
    ]);
  });
});
