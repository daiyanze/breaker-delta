/** The app core, run on the bun:sqlite Database adapter with an inline executor. */
import { Database as SQLite } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzleOver } from "@bd/db";
import { createPipeline, type PipelinePorts, pipelineConfig } from "../src/core/app.ts";
import { closeRun, openRun } from "../src/core/runs.ts";
import { sqliteDatabase } from "../src/local/database.ts";

const MIGRATION = join(import.meta.dir, "../../../packages/db/migrations/0000_init.sql");
const NOW = Date.UTC(2026, 10, 19, 5, 7); // 14:07 JST, inside slot 20261119T0500

/** A pipeline on an in-memory database, with an executor that runs the slot inline. */
function setup(overrides: Partial<PipelinePorts> = {}) {
  const sqlite = new SQLite(":memory:");
  sqlite.exec(readFileSync(MIGRATION, "utf8"));
  const db = sqliteDatabase(sqlite);
  const orm = drizzleOver(db);
  const started: string[] = [];
  const ports: PipelinePorts = {
    db,
    clock: { now: () => NOW },
    runs: {
      async start(slot) {
        if (started.includes(slot)) throw new Error(`instance ${slot} already exists`);
        started.push(slot);
        await openRun(orm, slot, NOW);
        await closeRun(orm, slot, NOW + 1000);
      },
    },
    ...overrides,
  };
  const config = pipelineConfig({ RUN_INTERVAL_MINUTES: "60", PROBE_TOKEN: "secret" });
  return { pipeline: createPipeline(ports, config), started };
}

const get = (path: string, token?: string) =>
  new Request(`https://bd.test${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("pipeline config", () => {
  test("defaults to 60 minutes and no probe token", () => {
    expect(pipelineConfig({})).toEqual({ runIntervalMinutes: 60, probeToken: null });
  });

  test("reads the interval and the token", () => {
    const config = pipelineConfig({ RUN_INTERVAL_MINUTES: "30", PROBE_TOKEN: "t" });
    expect(config).toEqual({ runIntervalMinutes: 30, probeToken: "t" });
  });
});

describe("tick", () => {
  test("starts the current slot once", async () => {
    const { pipeline, started } = setup();
    expect(await pipeline.tick()).toEqual({ slot: "20261119T0500", started: true });
    expect(await pipeline.tick()).toEqual({
      slot: "20261119T0500",
      started: false,
      reason: "slot already ran",
    });
    expect(started).toEqual(["20261119T0500"]);
  });

  test("reports an executor that refuses the slot, without throwing", async () => {
    const { pipeline } = setup({
      runs: {
        async start() {
          throw new Error("instance already exists");
        },
      },
    });
    expect(await pipeline.tick()).toEqual({
      slot: "20261119T0500",
      started: false,
      reason: "instance already exists",
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
    expect(body.lastRun).toMatchObject({ slot: "20261119T0500", status: "done" });
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
    expect(await res.json()).toEqual({ slot: "20261119T0500", started: true });
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
