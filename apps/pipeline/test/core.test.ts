/** The app core, run on the bun:sqlite Database adapter. */
import { describe, expect, test } from "bun:test";
import { PROMPTS, SUMMARIZE_PROMPT } from "@bd/judge";
import { createPipeline, type PipelinePorts, pipelineConfig } from "../src/core/app.ts";
import { memoryBlobs, migratedDatabase, NOW, SLOT } from "./helpers.ts";

/** No network in tests: every source answers 404, which is not retried. */
const offline = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;

function setup(overrides: Partial<PipelinePorts> = {}) {
  const { db } = migratedDatabase();
  const ports: PipelinePorts = {
    db,
    clock: { now: () => NOW },
    blobs: memoryBlobs().blobs,
    fetch: offline,
    ...overrides,
  };
  const config = pipelineConfig({ PROBE_TOKEN: "secret" });
  return { pipeline: createPipeline(ports, config) };
}

const get = (path: string, token?: string) =>
  new Request(`https://bd.test${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("pipeline config", () => {
  test("holds the tokens and the model driver; behaviour comes from settings", () => {
    const without = (vars: Parameters<typeof pipelineConfig>[0]) => {
      const { prompts: _, ...rest } = pipelineConfig(vars);
      return rest;
    };
    const none = { probeToken: null, reportToken: null, model: null };
    expect(without({})).toEqual(none);
    expect(without({ PROBE_TOKEN: "t" })).toEqual({ ...none, probeToken: "t" });
    expect(without({ REPORT_TOKEN: "r" })).toEqual({ ...none, reportToken: "r" });
    expect(without({ REPORT_TOKEN: "" })).toEqual(none);
    expect(without({ MODEL_DRIVER: "" })).toEqual(none);
    expect(without({ MODEL_DRIVER: "fake" })).toEqual({ ...none, model: "fake" });
  });

  test("hands the shipped prompts to the chains: assign-v1 and summarize-v1", () => {
    const { prompts } = pipelineConfig({});
    expect(prompts?.versions).toEqual({ assign: "assign-v1", summarize: "summarize-v1" });
    expect(prompts?.assign?.({ echoes: [], topics: [] })).toEqual(
      PROMPTS.assign?.messages({ echoes: [], topics: [] }),
    );
    const input = {
      name: "n",
      echoes: [{ id: "e1", title: "t" }],
      languages: ["en" as const],
      first: true,
    };
    expect(prompts?.summarize?.(input)).toEqual(SUMMARIZE_PROMPT.messages(input));
  });

  test("an unknown MODEL_DRIVER is refused, not run without a model", () => {
    expect(() => pipelineConfig({ MODEL_DRIVER: "fak" })).toThrow(
      "MODEL_DRIVER must be unset or one of: fake",
    );
  });
});

describe("tick", () => {
  test("runs the current slot once", async () => {
    const { pipeline } = setup();
    expect(await pipeline.tick()).toEqual({
      slot: SLOT,
      started: true,
      status: "done",
      resumed: false,
    });
    expect(await pipeline.tick()).toEqual({
      slot: SLOT,
      started: false,
      reason: "slot already ran",
    });
  });
});

describe("fetch", () => {
  test("/health reports the last run", async () => {
    const { pipeline } = setup();
    const empty = await (await pipeline.fetch(get("/health"))).json();
    expect(empty).toEqual({ ok: true, lastRun: null });
    await pipeline.tick();
    const body = (await (await pipeline.fetch(get("/health"))).json()) as {
      lastRun: { slot: string; status: string };
    };
    expect(body.lastRun).toMatchObject({ slot: SLOT, status: "done" });
  });

  test("/__tick and /__probe do not exist without the token", async () => {
    const { pipeline } = setup();
    expect((await pipeline.fetch(get("/__tick"))).status).toBe(404);
    expect((await pipeline.fetch(get("/__probe", "wrong"))).status).toBe(404);
    expect((await pipeline.fetch(get("/elsewhere"))).status).toBe(404);
  });

  test("/__tick runs a tick with the token", async () => {
    const { pipeline } = setup();
    const res = await pipeline.fetch(get("/__tick", "secret"));
    expect(await res.json()).toMatchObject({ slot: SLOT, started: true, status: "done" });
  });

  test("/__probe uses the injected fetch", async () => {
    const fake = (async () => new Response("ok")) as unknown as typeof fetch;
    const { pipeline } = setup({ fetch: fake });
    const results = (await (await pipeline.fetch(get("/__probe", "secret"))).json()) as {
      ok: boolean;
    }[];
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
