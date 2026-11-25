/**
 * The whole run wired together (#36): every step in order on one database,
 * with test sources and a model that can be made to fail.
 */
import { describe, expect, test } from "bun:test";
import { drizzleOver } from "@bd/db";
import { fakeDriver, type ModelDriver } from "@bd/judge";
import type { PurgeRequest, SiteCache } from "@bd/ports";
import { createPipeline, pipelineConfig } from "../src/core/app.ts";
import { noModelDriver } from "../src/core/model.ts";
import type { Step } from "../src/core/runner.ts";
import { changeSettings } from "../src/core/settings.ts";
import { buildSteps, STEP_NAMES } from "../src/core/steps.ts";
import type { Adapter } from "../src/sources/adapter.ts";
import type { LaunchGroup } from "../src/sources/launch-groups.ts";
import { d1Limited, memoryBlobs, migratedDatabase, NOW, SLOT } from "./helpers.ts";

const HOUR = 3_600_000;
const NEXT = "20261119T0600";

/** Test groups: one JSON URL each, `{ items: [{ url, title }] }`. */
const GROUP_IDS = ["alpha", "beta", "gamma", "delta"];
const GROUPS: LaunchGroup[] = GROUP_IDS.map((id) => ({
  id,
  name: id,
  tier: "first_hand",
  countsAsOne: false,
  minIntervalMinutes: 0,
  probeUrl: `https://${id}.example.com/feed`,
}));
const ADAPTERS: Record<string, Adapter> = Object.fromEntries(
  GROUP_IDS.map((id) => [
    id,
    {
      groupId: id,
      format: "json",
      urls: () => [`https://${id}.example.com/feed`],
      parse: (body: string) =>
        (JSON.parse(body) as { items: { url: string; title: string }[] }).items.map((i) => ({
          ...i,
          publishedAt: null,
          heat: null,
        })),
    } satisfies Adapter,
  ]),
);

const TITLE = "Acme ships Rocket model for robots";

/** A model whose calls can be switched off: `down` fails both, `summarizeDown` only summarize. */
function switchableModel() {
  const fake = fakeDriver();
  const none = noModelDriver();
  const state = { down: false, summarizeDown: false, summarizeCalls: 0 };
  const driver: ModelDriver = {
    assign: (input) => (state.down ? none.assign(input) : fake.assign(input)),
    summarize: (input) => {
      state.summarizeCalls++;
      return state.down || state.summarizeDown ? none.summarize(input) : fake.summarize(input);
    },
  };
  return { driver, state };
}

function setup() {
  const { db: plain, sqlite } = migratedDatabase();
  // Every step's statements within D1's bound-value limit, as on Cloudflare.
  const db = d1Limited(plain);
  const orm = drizzleOver(db);
  const { blobs } = memoryBlobs();
  const model = switchableModel();
  /** Which groups list the story; each lists it under its own URL. */
  const listing = new Set(["alpha", "beta", "gamma"]);
  let fetches = 0;
  const fetchStub = (async (input: string | URL | Request) => {
    fetches++;
    const id = new URL(String(input)).hostname.split(".")[0] ?? "";
    const items = listing.has(id)
      ? [{ url: `https://${id}.example.com/acme-rocket`, title: TITLE }]
      : [];
    return new Response(JSON.stringify({ items }), {
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  const purges: PurgeRequest[] = [];
  const siteState = { failing: false };
  const site: SiteCache = {
    async purge(request) {
      purges.push(request);
      if (siteState.failing) throw new Error("site unreachable");
      return { purged: 0 };
    },
  };
  const steps: Step[] = buildSteps({
    blobs,
    fetch: fetchStub,
    model: { assign: model.driver, summarize: model.driver },
    site,
    groups: GROUPS,
    adapters: ADAPTERS,
  });
  let now = NOW;
  const pipeline = createPipeline(
    { db, clock: { now: () => now }, blobs },
    pipelineConfig({}),
    steps,
  );
  const q = <T>(sql: string, ...params: (string | number)[]) =>
    sqlite.query(sql).all(...params) as T[];
  const output = <T>(slot: string, step: string): T => {
    const [row] = q<{ output: string }>(
      "SELECT output FROM run_steps WHERE slot = ? AND step = ?",
      slot,
      step,
    );
    return JSON.parse(row?.output ?? "null") as T;
  };
  return {
    orm,
    q,
    output,
    model: model.state,
    listing,
    purges,
    siteState,
    fetches: () => fetches,
    tick: () => pipeline.tick(),
    setNow: (ms: number) => {
      now = ms;
    },
  };
}

type StepRow = { step: string; status: string };

describe("the wired run", () => {
  test("runs every step in order: scan to retention, no enrich yet", () => {
    const names = buildSteps({
      blobs: memoryBlobs().blobs,
      fetch: fetch,
      model: { assign: fakeDriver(), summarize: fakeDriver() },
      site: { purge: async () => ({ purged: 0 }) },
      groups: [],
      adapters: {},
    }).map((s) => s.name);
    expect(names).toEqual([...STEP_NAMES]);
    expect(names).toEqual([
      "scan",
      "ingest",
      "assign",
      "compute",
      "changes",
      "select",
      "summarize",
      "validate",
      "commit",
      "publish",
      "retention",
    ]);
  });

  test("with a working model, a story in three groups becomes a wave with a summary", async () => {
    const t = setup();
    expect(await t.tick()).toMatchObject({ slot: SLOT, status: "done" });
    const steps = t.q<StepRow>("SELECT step, status FROM run_steps WHERE slot = ?", SLOT);
    expect(steps.map((s) => s.step).sort()).toEqual([...STEP_NAMES].sort());
    expect(steps.every((s) => s.status === "done")).toBe(true);
    const [point] = t.q<{ topic_id: string; state: string }>(
      "SELECT topic_id, state FROM wave_points WHERE slot = ?",
      SLOT,
    );
    expect(point?.state).toBe("up");
    expect(t.output<{ published: string[] }>(SLOT, "commit").published).toEqual([
      point?.topic_id ?? "",
    ]);
    expect(t.purges).toEqual([{ slot: SLOT, topicIds: [point?.topic_id ?? ""] }]);
  });
});

describe("a model failure (acceptance 1)", () => {
  test("summarize down: the board updates, and the summary is written next run", async () => {
    const t = setup();
    t.model.summarizeDown = true;
    expect(await t.tick()).toMatchObject({ slot: SLOT, status: "done" });

    // Every step finished, publish and retention included.
    const steps = t.q<StepRow>("SELECT step, status FROM run_steps WHERE slot = ?", SLOT);
    expect(steps).toHaveLength(STEP_NAMES.length);
    expect(steps.every((s) => s.status === "done")).toBe(true);

    // The board: compute wrote the wave's point and state.
    const points = t.q<{ topic_id: string; state: string; rank: number }>(
      "SELECT topic_id, state, rank FROM wave_points WHERE slot = ?",
      SLOT,
    );
    expect(points).toHaveLength(1);
    const topicId = points[0]?.topic_id ?? "";
    expect(points[0]).toMatchObject({ state: "up", rank: 1 });
    expect(t.q("SELECT state FROM topics WHERE id = ?", topicId)).toEqual([{ state: "up" }]);

    // Selected, its model call failed, nothing committed.
    expect(t.output<{ selected: unknown[] }>(SLOT, "select").selected).toEqual([
      { topicId, reason: "formed" },
    ]);
    expect(t.output<{ failed: string[] }>(SLOT, "summarize").failed).toEqual([topicId]);
    expect(t.output(SLOT, "commit")).toEqual({ published: [], formed: [], discarded: [] });
    expect(t.q("SELECT COUNT(*) AS n FROM summaries")).toEqual([{ n: 0 }]);
    expect(t.q("SELECT COUNT(*) AS n FROM predictions")).toEqual([{ n: 0 }]);
    expect(t.purges).toEqual([{ slot: SLOT, topicIds: [] }]);

    // Next run, model back: the wave is still due and gets its first summary.
    t.model.summarizeDown = false;
    t.setNow(NOW + HOUR);
    expect(await t.tick()).toMatchObject({ slot: NEXT, status: "done" });
    expect(t.output<{ selected: unknown[] }>(NEXT, "select").selected).toEqual([
      { topicId, reason: "formed" },
    ]);
    expect(t.output(NEXT, "commit")).toEqual({
      published: [topicId],
      formed: [topicId],
      discarded: [],
    });
    expect(
      t.q("SELECT topic_id, version, status FROM summaries WHERE topic_id = ?", topicId),
    ).toEqual([{ topic_id: topicId, version: 1, status: "published" }]);
    expect(t.q("SELECT COUNT(*) AS n FROM predictions WHERE topic_id = ?", topicId)).toEqual([
      { n: 1 },
    ]);
  });

  test("model down entirely: the board still moves, and new echoes wait for the next run", async () => {
    const t = setup();
    expect(await t.tick()).toMatchObject({ slot: SLOT, status: "done" });
    const [first] = t.q<{ topic_id: string }>(
      "SELECT topic_id FROM wave_points WHERE slot = ?",
      SLOT,
    );
    const topicId = first?.topic_id ?? "";

    // Next run: a fourth source lists the story, and the model is down.
    t.model.down = true;
    t.listing.add("delta");
    t.setNow(NOW + HOUR);
    expect(await t.tick()).toMatchObject({ slot: NEXT, status: "done" });
    const steps = t.q<StepRow>("SELECT step, status FROM run_steps WHERE slot = ?", NEXT);
    expect(steps.every((s) => s.status === "done")).toBe(true);
    expect(t.output(NEXT, "assign")).toMatchObject({ echoes: 1, assigned: 0, unassigned: 1 });
    // The board has this run's point for the wave, from the echoes it had.
    expect(t.q("SELECT topic_id, state FROM wave_points WHERE slot = ?", NEXT)).toEqual([
      { topic_id: topicId, state: "up" },
    ]);
    expect(t.q("SELECT COUNT(*) AS n FROM echoes WHERE topic_id IS NULL")).toEqual([{ n: 1 }]);

    // The run after, model back: the waiting echo joins the wave.
    t.model.down = false;
    t.setNow(NOW + 2 * HOUR);
    expect(await t.tick()).toMatchObject({ slot: "20261119T0700", status: "done" });
    expect(t.output("20261119T0700", "assign")).toMatchObject({ echoes: 1, assigned: 1 });
    expect(t.q("SELECT COUNT(*) AS n FROM echoes WHERE topic_id = ?", topicId)).toEqual([{ n: 4 }]);
  });
});

describe("a slot never runs twice (acceptance 2)", () => {
  test("a second tick in the slot changes nothing and fetches nothing", async () => {
    const t = setup();
    await t.tick();
    const fetched = t.fetches();
    const snapshot = () =>
      JSON.stringify([t.q("SELECT * FROM runs"), t.q("SELECT * FROM run_steps")]);
    const before = snapshot();
    expect(await t.tick()).toEqual({ slot: SLOT, started: false, reason: "slot already ran" });
    expect(t.fetches()).toBe(fetched);
    expect(t.purges).toHaveLength(1);
    expect(t.model.summarizeCalls).toBe(1);
    expect(snapshot()).toBe(before);
  });

  test("a failed run is not started again in its slot", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { stepMaxAttempts: 1 });
    t.siteState.failing = true;
    expect(await t.tick()).toMatchObject({
      status: "failed",
      reason: "step publish failed: Error: site unreachable",
    });
    // Retention, after publish, did not run.
    expect(t.q("SELECT step FROM run_steps WHERE slot = ? AND step = 'retention'", SLOT)).toEqual(
      [],
    );
    t.siteState.failing = false;
    const fetched = t.fetches();
    expect(await t.tick()).toEqual({ slot: SLOT, started: false, reason: "slot already ran" });
    expect(t.fetches()).toBe(fetched);
    expect(t.purges).toHaveLength(1);
  });

  test("a run that stopped halfway resumes after its last finished step", async () => {
    const t = setup();
    await t.tick();
    // As if the process died after commit: the run still running, its lease
    // expired, publish and retention never recorded.
    t.q("UPDATE runs SET status = 'running', finished_at = NULL, lease_until = 0");
    t.q("DELETE FROM run_steps WHERE step IN ('publish', 'retention')");
    const fetched = t.fetches();
    const summarized = t.model.summarizeCalls;
    t.purges.length = 0;
    expect(await t.tick()).toMatchObject({ slot: SLOT, status: "done", resumed: true });
    expect(t.fetches()).toBe(fetched);
    expect(t.model.summarizeCalls).toBe(summarized);
    expect(t.purges).toHaveLength(1);
    expect(t.q("SELECT COUNT(*) AS n FROM summaries")).toEqual([{ n: 1 }]);
  });
});

describe("the default steps", () => {
  test("with no site bound (a preview), publish purges nothing and the run finishes", async () => {
    const { db, sqlite } = migratedDatabase();
    const offline = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const pipeline = createPipeline(
      { db, clock: { now: () => NOW }, blobs: memoryBlobs().blobs, fetch: offline },
      pipelineConfig({}),
    );
    expect(await pipeline.tick()).toMatchObject({ slot: SLOT, status: "done" });
    const rows = sqlite.query("SELECT step, status, output FROM run_steps").all() as {
      step: string;
      status: string;
      output: string;
    }[];
    expect(rows.map((r) => r.step).sort()).toEqual([...STEP_NAMES].sort());
    expect(rows.every((r) => r.status === "done")).toBe(true);
    const publish = rows.find((r) => r.step === "publish");
    expect(JSON.parse(publish?.output ?? "null")).toEqual({ topics: 0, purged: 0 });
  });
});
