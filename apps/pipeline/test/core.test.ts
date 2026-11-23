/** The app core, run on the bun:sqlite Database adapter. */
import { describe, expect, test } from "bun:test";
import { createPipeline, type PipelinePorts, pipelineConfig } from "../src/core/app.ts";
import { migratedDatabase, NOW, SLOT } from "./helpers.ts";

function setup(overrides: Partial<PipelinePorts> = {}) {
  const { db } = migratedDatabase();
  const ports: PipelinePorts = { db, clock: { now: () => NOW }, ...overrides };
  const config = pipelineConfig({ PROBE_TOKEN: "secret" });
  return { pipeline: createPipeline(ports, config) };
}

const get = (path: string, token?: string) =>
  new Request(`https://bd.test${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("pipeline config", () => {
  test("holds only the probe token; behaviour comes from settings", () => {
    expect(pipelineConfig({})).toEqual({ probeToken: null });
    expect(pipelineConfig({ PROBE_TOKEN: "t" })).toEqual({ probeToken: "t" });
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
