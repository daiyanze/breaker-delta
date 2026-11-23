/** The retention step (M1-22, #38) on an in-memory database and fake blobs. */
import { describe, expect, test } from "bun:test";
import { drizzleOver } from "@bd/db";
import type { Blobs } from "@bd/ports";
import { type RetentionOutput, retentionStep } from "../src/core/retention.ts";
import type { StepContext } from "../src/core/runner.ts";
import { rawKey } from "../src/core/scan.ts";
import { changeSettings } from "../src/core/settings.ts";
import { migratedDatabase, NOW, SLOT } from "./helpers.ts";

const DAY = 86_400_000;

function memoryBlobs() {
  const store = new Map<string, string>();
  const blobs: Blobs = {
    async get(key) {
      const v = store.get(key);
      return v === undefined ? null : new TextEncoder().encode(v);
    },
    async put(key, body) {
      store.set(key, typeof body === "string" ? body : new TextDecoder().decode(body));
    },
    async delete(key) {
      store.delete(key);
    },
    async list(prefix) {
      return [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
  return { blobs, store };
}

function setup() {
  const { db, sqlite } = migratedDatabase();
  const orm = drizzleOver(db);
  const { blobs, store } = memoryBlobs();
  const ctx = (now = NOW): StepContext => ({
    slot: SLOT,
    db: orm,
    now: () => now,
    outputs: new Map(),
  });
  const run = (now = NOW) => retentionStep({ blobs }).run(ctx(now)) as Promise<RetentionOutput>;

  /** An echo first seen `daysAgo` days before NOW, optionally in a topic. */
  const echo = (id: string, daysAgo: number, topicId: string | null = null) =>
    sqlite.run(
      `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id)
       VALUES (?1, ?2, 'g', 't', ?3, 's', ?4)`,
      [id, `https://x.test/${id}`, NOW - daysAgo * DAY, topicId],
    );
  const heat = (echoId: string, slot: string, daysAgo: number) =>
    sqlite.run("INSERT INTO echo_metrics (echo_id, slot, heat, seen_at) VALUES (?1, ?2, 1, ?3)", [
      echoId,
      slot,
      NOW - daysAgo * DAY,
    ]);
  const topic = (id: string, state = "echo", formedAt: number | null = null) =>
    sqlite.run(
      "INSERT INTO topics (id, slug, name, state, created_at, formed_at) VALUES (?1, ?1, ?1, ?2, 0, ?3)",
      [id, state, formedAt],
    );
  const ids = () =>
    (sqlite.query("SELECT id FROM echoes ORDER BY id").all() as { id: string }[]).map((r) => r.id);
  const metricRows = () =>
    sqlite.query("SELECT echo_id, slot FROM echo_metrics ORDER BY echo_id, slot").all();
  return { sqlite, orm, store, run, echo, heat, topic, ids, metricRows };
}

describe("echoes", () => {
  test("an unassigned echo last seen over 30 days ago is removed with its heat", async () => {
    const t = setup();
    t.echo("old", 31);
    t.heat("old", "s1", 31);
    t.echo("young", 29);
    t.heat("young", "s2", 29);
    const out = await t.run();
    expect(out.echoesRemoved).toBe(1);
    expect(t.ids()).toEqual(["young"]);
    expect(t.metricRows()).toEqual([{ echo_id: "young", slot: "s2" }]);
  });

  test("the window is measured from the last time a source listed the echo", async () => {
    const t = setup();
    t.echo("still-listed", 60);
    t.heat("still-listed", "s1", 60);
    t.heat("still-listed", "s2", 10);
    await t.run();
    expect(t.ids()).toEqual(["still-listed"]);
  });

  test("exactly 30 days is kept; the boundary is strict", async () => {
    const t = setup();
    t.echo("edge", 30);
    await t.run();
    expect(t.ids()).toEqual(["edge"]);
  });

  test("an echo of a topic that is not a wave is removed", async () => {
    const t = setup();
    t.topic("quiet");
    t.echo("old", 40, "quiet");
    await t.run();
    expect(t.ids()).toEqual([]);
  });

  test("echoes of wave topics are never removed, however old", async () => {
    const t = setup();
    t.topic("up", "up", NOW - 90 * DAY);
    t.topic("flat", "flat", NOW - 90 * DAY);
    t.echo("in-up", 400, "up");
    t.echo("in-flat", 400, "flat");
    const out = await t.run();
    expect(out.echoesRemoved).toBe(0);
    expect(t.ids()).toEqual(["in-flat", "in-up"]);
  });

  test("a topic whose state is up or flat counts as a wave without formed_at", async () => {
    const t = setup();
    t.topic("up", "up");
    t.topic("flat", "flat");
    t.echo("in-up", 400, "up");
    t.echo("in-flat", 400, "flat");
    await t.run();
    expect(t.ids()).toEqual(["in-flat", "in-up"]);
  });

  test("a topic that formed once counts as a wave, whatever its state says", async () => {
    const t = setup();
    t.topic("formed", "echo", NOW - 90 * DAY);
    t.echo("a", 400, "formed");
    await t.run();
    expect(t.ids()).toEqual(["a"]);
  });

  test("a topic with a wave point as up or flat counts as a wave", async () => {
    const t = setup();
    t.topic("pointed");
    t.sqlite.run(
      `INSERT INTO wave_points (slot, topic_id, state, height, source_count, echo_count)
       VALUES ('s1', 'pointed', 'flat', 1, 3, 3)`,
    );
    t.topic("only-echo-points");
    t.sqlite.run(
      `INSERT INTO wave_points (slot, topic_id, state, height, source_count, echo_count)
       VALUES ('s1', 'only-echo-points', 'echo', 1, 1, 1)`,
    );
    t.echo("a", 400, "pointed");
    t.echo("b", 400, "only-echo-points");
    await t.run();
    expect(t.ids()).toEqual(["a"]);
  });

  test("a topic with a wave_formed event counts as a wave", async () => {
    const t = setup();
    t.topic("evented");
    t.sqlite.run(
      "INSERT INTO events (type, topic_id, slot, at) VALUES ('wave_formed', 'evented', 's1', 0)",
    );
    t.echo("a", 400, "evented");
    await t.run();
    expect(t.ids()).toEqual(["a"]);
  });

  test("an echo a summary cites is kept", async () => {
    const t = setup();
    t.echo("cited", 400);
    t.sqlite.run("INSERT INTO summary_evidence (summary_id, echo_id) VALUES ('sum1', 'cited')");
    await t.run();
    expect(t.ids()).toEqual(["cited"]);
  });

  test("an echo a topic edit names is kept (merged or moved echoes)", async () => {
    const t = setup();
    t.topic("quiet");
    t.echo("moved", 400, "quiet");
    t.sqlite.run(
      `INSERT INTO topic_edits (kind, topic_id, other_topic_id, echo_id, editor, at)
       VALUES ('reassign', 'quiet', 'was-wave', 'moved', 'pipeline', 0)`,
    );
    await t.run();
    expect(t.ids()).toEqual(["moved"]);
  });

  test("published rows are never touched", async () => {
    const t = setup();
    t.topic("quiet");
    t.echo("old", 400, "quiet");
    t.echo("cited", 400, "quiet");
    t.sqlite.run(
      `INSERT INTO summaries (id, topic_id, version, status, reason, writer, slot, created_at)
       VALUES ('sum1', 'quiet', 1, 'published', 'formed', 'w', 's1', 0)`,
    );
    t.sqlite.run("INSERT INTO summary_evidence (summary_id, echo_id) VALUES ('sum1', 'cited')");
    const tables = [
      "topics",
      "summaries",
      "summary_texts",
      "summary_evidence",
      "events",
      "predictions",
      "verdicts",
      "corrections",
      "correction_texts",
      "wave_points",
      "topic_edits",
    ];
    const counts = () =>
      tables.map(
        (name) => (t.sqlite.query(`SELECT count(*) AS n FROM ${name}`).get() as { n: number }).n,
      );
    const before = counts();
    await t.run();
    expect(t.ids()).toEqual(["cited"]);
    expect(counts()).toEqual(before);
  });

  test("the window comes from settings", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { echoRetentionDays: 7 });
    t.echo("eight", 8);
    t.echo("six", 6);
    await t.run();
    expect(t.ids()).toEqual(["six"]);
  });

  test("running again removes nothing more", async () => {
    const t = setup();
    t.echo("old", 31);
    expect((await t.run()).echoesRemoved).toBe(1);
    expect((await t.run()).echoesRemoved).toBe(0);
  });

  test("many echoes are removed in chunks", async () => {
    const t = setup();
    for (let i = 0; i < 1203; i++) t.echo(`e${String(i).padStart(4, "0")}`, 45);
    t.echo("young", 1);
    const out = await t.run();
    expect(out.echoesRemoved).toBe(1203);
    expect(t.ids()).toEqual(["young"]);
  });
});

describe("raw responses", () => {
  const slotDaysAgo = (days: number) => {
    const d = new Date(Date.UTC(2026, 10, 19, 5) - days * DAY);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}00`;
  };

  test("raw responses of slots over 30 days old are removed; newer ones stay", async () => {
    const t = setup();
    const old = slotDaysAgo(31);
    const young = slotDaysAgo(29);
    t.store.set(rawKey(old, "a"), "{}");
    t.store.set(rawKey(old, "b"), "{}");
    t.store.set(rawKey(young, "a"), "{}");
    t.store.set(rawKey(SLOT, "a"), "{}");
    t.store.set("og/card.png", "x");
    const out = await t.run();
    expect(out.rawRemoved).toBe(2);
    expect([...t.store.keys()].sort()).toEqual(
      [rawKey(young, "a"), rawKey(SLOT, "a"), "og/card.png"].sort(),
    );
  });

  test("a slot exactly 30 days old is kept; the boundary is strict", async () => {
    const t = setup();
    t.store.set(rawKey(slotDaysAgo(30), "a"), "{}");
    // The clock at the top of the slot, so the cutoff equals the old slot's start.
    const out = await t.run(Date.UTC(2026, 10, 19, 5));
    expect(out.rawRemoved).toBe(0);
  });

  test("a key under raw/ that is not a slot is left alone", async () => {
    const t = setup();
    t.store.set("raw/notes.txt", "x");
    t.store.set("raw/not-a-slot/a.json", "x");
    const out = await t.run();
    expect(out.rawRemoved).toBe(0);
    expect(t.store.size).toBe(2);
  });

  test("the window comes from settings", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { rawRetentionDays: 2 });
    t.store.set(rawKey(slotDaysAgo(3), "a"), "{}");
    t.store.set(rawKey(slotDaysAgo(1), "a"), "{}");
    const out = await t.run();
    expect(out.rawRemoved).toBe(1);
    expect([...t.store.keys()]).toEqual([rawKey(slotDaysAgo(1), "a")]);
  });
});
