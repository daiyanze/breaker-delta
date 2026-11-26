/**
 * Provider chains from settings (#42): keys are read through the adapter's
 * secret reader and reach only the request's authorization header; assign
 * and summarize use their own chains; a task with an empty chain, or any
 * task while no prompts are given, is skipped and the board still updates.
 *
 * These tests inject `PROMPTS`: the input as JSON, which the stand-in
 * endpoint reads back. It is not a real prompt; `assign-v1` and
 * `summarize-v1` are tested in `packages/judge/src/`. One test runs assign
 * with the shipped prompts as `pipelineConfig` gives them.
 *
 * The runs use the recorded fixture sources and a stand-in model endpoint
 * that answers with the fake driver's output. Assertions compare ids,
 * counts and hosts only, never fetched text (invariant 6).
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
  PROMPTS as SHIPPED,
  type SummarizeInput,
} from "@bd/judge";
import { createPipeline, pipelineConfig } from "../src/core/app.ts";
import type { AssignOutput } from "../src/core/assign.ts";
import type { EnrichOutput } from "../src/core/enrich.ts";
import { fixtureFetch } from "../src/core/fixture-sources.ts";
import { resolveProviders, runModel, stringVars } from "../src/core/model.ts";
import { changeSettings } from "../src/core/settings.ts";
import { STEP_NAMES } from "../src/core/steps.ts";
import type { SummarizeOutput } from "../src/core/summarize.ts";
import { memoryBlobs, migratedDatabase, NOW, SLOT } from "./helpers.ts";

const HOUR = 3_600_000;
const SLOT_2 = "20261119T0600";
const FIXTURES = join(import.meta.dir, "../src/sources/fixtures");

const ASSIGN_KEY = "test-assign-key-0001";
const SUMMARIZE_KEY = "test-summarize-key-0002";

/** Test-only prompts: the input as JSON. */
const PROMPTS: DriverPrompts = {
  assign: (input) => [{ role: "user", content: JSON.stringify(input) }],
  summarize: (input) => [{ role: "user", content: JSON.stringify(input) }],
};

const provider = (name: string, apiKeyRef?: string): Provider => ({
  name,
  baseUrl: `https://${name}.test/v1`,
  model: `${name}-model`,
  ...(apiKeyRef ? { apiKeyRef } : {}),
});

describe("resolveProviders", () => {
  const secret = stringVars({ SET: "k1", EMPTY: "" });

  test("reads each key through the secret its apiKeyRef names", () => {
    expect(resolveProviders([provider("a", "SET"), provider("b")], secret)).toEqual([
      { name: "a", baseUrl: "https://a.test/v1", model: "a-model", apiKey: "k1" },
      { name: "b", baseUrl: "https://b.test/v1", model: "b-model" },
    ]);
  });

  test("a provider whose secret is unset or empty is left out, not called without its key", () => {
    const out = resolveProviders(
      [provider("a", "UNSET"), provider("b", "EMPTY"), provider("c")],
      secret,
    );
    expect(out.map((p) => p.name)).toEqual(["c"]);
  });

  test("a key is trimmed, and one with a control character inside is left out", () => {
    const read = stringVars({
      TRAILING: "k2\n",
      CRLF: "k3\r\nX-Injected: y",
      NUL: "k4\u0000z",
      TAB: "k5\tz",
    });
    const out = resolveProviders(
      ["TRAILING", "CRLF", "NUL", "TAB"].map((ref) => provider(ref.toLowerCase(), ref)),
      read,
    );
    expect(out.map((p) => [p.name, p.apiKey])).toEqual([["trailing", "k2"]]);
  });

  test("a key with CR/LF or NUL never reaches the chain's error", async () => {
    const key = "test-key-0003";
    const read = stringVars({ CRLF: `${key}\r\nX: y`, NUL: `${key}\u0000z` });
    const m = runModel(
      null,
      { assignProviders: [provider("a", "CRLF"), provider("b", "NUL")], summarizeProviders: [] },
      read,
      (async () => Response.json({})) as unknown as typeof fetch,
      PROMPTS,
    );
    const err = await m.assign?.assign({ echoes: [], topics: [] }).catch((e: Error) => e);
    expect(err instanceof Error).toBe(true);
    expect(String((err as Error).message).includes(key)).toBe(false);
  });
});

describe("stringVars", () => {
  test("reads own non-empty strings only, never a binding or an inherited property", () => {
    const read = stringVars({ KEY: "v", DB: { prepare() {} }, EMPTY: "" });
    expect(read("KEY")).toBe("v");
    expect(read("DB")).toBeUndefined();
    expect(read("EMPTY")).toBeUndefined();
    expect(read("toString")).toBeUndefined();
    expect(read("MISSING")).toBeUndefined();
  });
});

describe("runModel", () => {
  const none = () => undefined;

  test("an empty chain gives no model for that task", () => {
    const m = runModel(null, { assignProviders: [], summarizeProviders: [] }, none, fetch, PROMPTS);
    expect(m).toEqual({ assign: null, summarize: null });
  });

  test("without prompts no chain is used, whatever the chains hold", () => {
    const chains = { assignProviders: [provider("a")], summarizeProviders: [provider("b")] };
    expect(runModel(null, chains, none, fetch)).toEqual({ assign: null, summarize: null });
  });

  test("each task gets a model only when it has its own prompt, whatever the other has", () => {
    const chains = { assignProviders: [provider("a")], summarizeProviders: [provider("b")] };
    const asJson = (input: unknown) => [{ role: "user" as const, content: JSON.stringify(input) }];
    const summarizeOnly = runModel(null, chains, none, fetch, { summarize: asJson });
    expect(summarizeOnly.assign).toBeNull();
    expect(summarizeOnly.summarize).not.toBeNull();
    const assignOnly = runModel(null, chains, none, fetch, { assign: asJson });
    expect(assignOnly.assign).not.toBeNull();
    expect(assignOnly.summarize).toBeNull();
  });

  test("with the shipped prompts both tasks get a model", () => {
    const chains = { assignProviders: [provider("a")], summarizeProviders: [provider("b")] };
    const m = runModel(null, chains, none, fetch, pipelineConfig({}).prompts ?? null);
    expect(m.assign).not.toBeNull();
    expect(m.summarize).not.toBeNull();
    expect(SHIPPED.assign?.version).toBe("assign-v1");
  });

  test("each task gets a model only when its own chain has providers", () => {
    const m = runModel(
      null,
      { assignProviders: [provider("a")], summarizeProviders: [] },
      none,
      fetch,
      PROMPTS,
    );
    expect(m.assign).not.toBeNull();
    expect(m.summarize).toBeNull();
  });

  test("a chain whose every key is missing is configured, so its calls fail instead of skipping", async () => {
    const m = runModel(
      null,
      { assignProviders: [provider("a", "UNSET")], summarizeProviders: [] },
      none,
      fetch,
      PROMPTS,
    );
    await expect(m.assign?.assign({ echoes: [], topics: [] }) ?? null).rejects.toThrow(
      "all providers failed",
    );
  });

  test("fake ignores the chains", () => {
    const m = runModel("fake", { assignProviders: [], summarizeProviders: [] }, none, fetch);
    expect(m.assign).not.toBeNull();
    expect(m.summarize).not.toBeNull();
  });
});

/** A model endpoint per host that answers with the fake driver's output. */
function modelEndpoint() {
  const calls: { host: string; auth: string | null }[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ host: url.host, auth: new Headers(init?.headers).get("authorization") });
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    const content = body.messages.at(-1)?.content ?? "null";
    // The shipped assign prompt puts the input between markers; the test prompts send it bare.
    const block = (name: string) =>
      JSON.parse(content.match(new RegExp(`<${name}>\\n(.*)\\n</${name}>`, "s"))?.[1] ?? "null");
    const data = content.includes("<echoes>")
      ? { echoes: block("echoes"), topics: block("topics") }
      : JSON.parse(content);
    const answer = url.host.startsWith("assign")
      ? fakeAssign(data as AssignInput)
      : fakeSummarize(data as SummarizeInput);
    return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
  };
  return { fetch: impl as typeof fetch, calls };
}

function setup() {
  const { db, sqlite } = migratedDatabase();
  const { blobs, store } = memoryBlobs();
  let now = NOW;
  const read = (file: string) => {
    try {
      return readFileSync(join(FIXTURES, file), "utf8");
    } catch {
      return null;
    }
  };
  const model = modelEndpoint();
  const ports = {
    db,
    clock: { now: () => now },
    blobs,
    fetch: fixtureFetch(read, () => now),
    modelFetch: model.fetch,
    secret: stringVars({ ASSIGN_KEY, SUMMARIZE_KEY }),
  };
  /** `prompts`: the test's own (default), none (null), or the shipped ones ("shipped"). */
  const pipeline = (driver?: string, prompts: DriverPrompts | null | "shipped" = PROMPTS) => {
    const config = pipelineConfig(driver ? { MODEL_DRIVER: driver } : {});
    if (prompts === null) delete config.prompts;
    else if (prompts !== "shipped") config.prompts = prompts;
    return createPipeline(ports, config);
  };
  const output = <T>(slot: string, step: string): T => {
    const row = sqlite
      .query("SELECT output FROM run_steps WHERE slot = ? AND step = ?")
      .get(slot, step) as { output: string } | null;
    return JSON.parse(row?.output ?? "null") as T;
  };
  /** Every row of every table, as text. */
  const dump = () => {
    const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    return tables
      .map((t) => JSON.stringify(sqlite.query(`SELECT * FROM "${t.name}"`).all()))
      .join("\n");
  };
  const count = (sql: string, ...params: string[]) =>
    (sqlite.query(sql).get(...params) as { n: number }).n;
  return {
    orm: drizzleOver(db),
    store,
    model,
    pipeline,
    output,
    dump,
    count,
    setNow: (ms: number) => {
      now = ms;
    },
  };
}

describe("a run with chains from settings", () => {
  test("assign and summarize use their own chains; keys reach only the request header", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW - 1, {
      assignProviders: [provider("assign", "ASSIGN_KEY")],
      summarizeProviders: [provider("summarize", "SUMMARIZE_KEY")],
    });
    const result = await t.pipeline().tick();
    expect(result).toMatchObject({ slot: SLOT, status: "done" });

    const assign = t.output<AssignOutput>(SLOT, "assign");
    expect(assign.skipped).toBeUndefined();
    expect(assign.assigned).toBeGreaterThan(0);
    const summarize = t.output<SummarizeOutput>(SLOT, "summarize");
    expect(summarize.skipped).toBeUndefined();
    expect(summarize.drafted.length).toBeGreaterThan(0);
    expect(t.count("SELECT count(*) AS n FROM summaries")).toBeGreaterThan(0);

    // Each chain went to its own endpoint, with its own key.
    const byHost = new Map(t.model.calls.map((c) => [c.host, c.auth]));
    expect([...byHost.keys()].sort()).toEqual(["assign.test", "summarize.test"]);
    expect(byHost.get("assign.test")).toBe(`Bearer ${ASSIGN_KEY}`);
    expect(byHost.get("summarize.test")).toBe(`Bearer ${SUMMARIZE_KEY}`);

    // Neither key is in the database, the blobs or what the tick reports.
    const stored = [t.dump(), ...t.store.values(), JSON.stringify(result)].join("\n");
    // Booleans only, so a failure prints no stored text (invariant 6).
    expect([ASSIGN_KEY, SUMMARIZE_KEY].map((key) => stored.includes(key))).toEqual([false, false]);
    // The settings name the secrets, not their values.
    expect(stored.includes("ASSIGN_KEY")).toBe(true);
  });

  test("with empty chains the model steps are skipped and the board still updates", async () => {
    const t = setup();
    // Run 1 with the fake model forms topics and writes the board.
    expect(await t.pipeline("fake").tick()).toMatchObject({ slot: SLOT, status: "done" });
    const points1 = t.count("SELECT count(*) AS n FROM wave_points WHERE slot = ?", SLOT);
    expect(points1).toBeGreaterThan(0);

    // Run 2 with the default settings: both chains are empty.
    t.setNow(NOW + HOUR);
    expect(await t.pipeline().tick()).toMatchObject({ slot: SLOT_2, status: "done" });
    expect(t.model.calls).toEqual([]);
    expect(t.output<AssignOutput>(SLOT_2, "assign").skipped).toBe(true);
    expect(t.output<SummarizeOutput>(SLOT_2, "summarize")).toEqual({
      drafted: [],
      failed: [],
      skipped: true,
    });
    // No summarize model, so enrich fetches no page either.
    expect(t.output<EnrichOutput>(SLOT_2, "enrich").skipped).toBe(true);
    const steps = t.count(
      "SELECT count(*) AS n FROM run_steps WHERE slot = ? AND status = 'done'",
      SLOT_2,
    );
    expect(steps).toBe(STEP_NAMES.length);
    expect(t.count("SELECT count(*) AS n FROM wave_points WHERE slot = ?", SLOT_2)).toBe(points1);
  });

  test("with the shipped prompts assign calls its chain at assign-v1", async () => {
    const t = setup();
    // Summarize's chain is empty, so its step is skipped: this test is about
    // the shipped assign prompt (summarize-v1 is tested in packages/judge).
    await changeSettings(t.orm, NOW - 1, {
      assignProviders: [provider("assign", "ASSIGN_KEY")],
      summarizeProviders: [],
    });
    expect(await t.pipeline(undefined, "shipped").tick()).toMatchObject({
      slot: SLOT,
      status: "done",
    });
    const hosts = new Set(t.model.calls.map((c) => c.host));
    expect([...hosts]).toEqual(["assign.test"]);
    const assign = t.output<AssignOutput>(SLOT, "assign");
    expect(assign.failedBatches).toBe(0);
    expect(assign.assigned).toBeGreaterThan(0);
    expect(t.output<SummarizeOutput>(SLOT, "summarize").skipped).toBe(true);
    expect(
      t.count("SELECT count(*) AS n FROM model_calls WHERE prompt_version = 'assign-v1'"),
    ).toBe(t.model.calls.length);
  });

  test("with chains set but no prompts no provider is called", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW - 1, {
      assignProviders: [provider("assign", "ASSIGN_KEY")],
      summarizeProviders: [provider("summarize", "SUMMARIZE_KEY")],
    });
    expect(await t.pipeline(undefined, {}).tick()).toMatchObject({ slot: SLOT, status: "done" });
    expect(t.model.calls).toEqual([]);
    expect(t.output<AssignOutput>(SLOT, "assign").skipped).toBe(true);
    expect(t.output<SummarizeOutput>(SLOT, "summarize").skipped).toBe(true);
    expect(
      t.count("SELECT count(*) AS n FROM run_steps WHERE slot = ? AND status = 'done'", SLOT),
    ).toBe(STEP_NAMES.length);
  });
});
