/** The changes step (M1-14, #30) on an in-memory database. */
import { describe, expect, test } from "bun:test";
import { slotStart } from "@bd/core";
import { drizzleOver } from "@bd/db";
import { type ChangesOutput, changesStep } from "../src/core/changes.ts";
import { computeStep } from "../src/core/compute.ts";
import type { StepContext } from "../src/core/runner.ts";
import { changeSettings } from "../src/core/settings.ts";
import { migratedDatabase, NOW, SLOT } from "./helpers.ts";

const DAY = 86_400_000;
/** Events are dated at the slot's start. */
const T = slotStart(SLOT);
/** The run before SLOT, and the slots 24 hours before each. */
const PREV = "20261119T0400";
const DAY_BEFORE = "20261118T0500";
const DAY_BEFORE_PREV = "20261118T0400";

function setup() {
  const { db, sqlite } = migratedDatabase();
  const orm = drizzleOver(db);
  const ctx = (slot = SLOT): StepContext => ({
    slot,
    db: orm,
    now: () => NOW,
    outputs: new Map(),
  });
  const run = async (slot = SLOT) => (await changesStep().run(ctx(slot))) as ChangesOutput;
  const point = (slot: string, topicId: string, state: string, height: number) =>
    sqlite.run(
      `INSERT INTO wave_points (slot, topic_id, state, height, rank, source_count, echo_count)
       VALUES (?1, ?2, ?3, ?4, NULL, 3, 3)`,
      [slot, topicId, state, height],
    );
  const events = () =>
    sqlite.query("SELECT type, topic_id, slot, at, detail FROM events ORDER BY id").all() as {
      type: string;
      topic_id: string;
      slot: string;
      at: number;
      detail: string | null;
    }[];
  return { sqlite, orm, ctx, run, point, events };
}

/** A wave whose 24-hour change goes from `before`% at PREV to the height at SLOT. */
function risingWave(t: ReturnType<typeof setup>, id: string, now: number, prev = 140) {
  t.point(DAY_BEFORE_PREV, id, "up", 100);
  t.point(DAY_BEFORE, id, "up", 100);
  t.point(PREV, id, "up", prev);
  t.point(SLOT, id, "up", now);
}

describe("went flat", () => {
  test("a point that is flat after an up point writes one went_flat event", async () => {
    const t = setup();
    t.point(PREV, "t1", "up", 40);
    t.point(SLOT, "t1", "flat", 12);
    expect(await t.run()).toEqual({ rising: [], wentFlat: ["t1"] });
    expect(t.events()).toEqual([
      { type: "went_flat", topic_id: "t1", slot: SLOT, at: T, detail: null },
    ]);
  });

  test("no event for a topic that was already flat, still up, or an echo", async () => {
    const t = setup();
    t.point(PREV, "flat", "flat", 10);
    t.point(SLOT, "flat", "flat", 10);
    t.point(PREV, "up", "up", 10);
    t.point(SLOT, "up", "up", 10);
    t.point(PREV, "echo", "echo", 10);
    t.point(SLOT, "echo", "echo", 10);
    t.point(SLOT, "new", "flat", 10);
    expect(await t.run()).toEqual({ rising: [], wentFlat: [] });
    expect(t.events()).toEqual([]);
  });

  test("a wave that goes flat again later gets a second event in that run", async () => {
    const t = setup();
    t.point(DAY_BEFORE, "t1", "up", 40);
    t.point(DAY_BEFORE_PREV, "t1", "flat", 30);
    t.point("20261118T0300", "t1", "up", 50);
    t.point(PREV, "t1", "up", 20);
    t.point(SLOT, "t1", "flat", 10);
    await t.run(DAY_BEFORE_PREV);
    await t.run();
    expect(t.events().map((e) => [e.type, e.slot])).toEqual([
      ["went_flat", DAY_BEFORE_PREV],
      ["went_flat", SLOT],
    ]);
  });
});

describe("rising", () => {
  test("crossing the line writes wave_rising with from, to and percent", async () => {
    const t = setup();
    risingWave(t, "t1", 160);
    expect(await t.run()).toEqual({ rising: ["t1"], wentFlat: [] });
    const [event] = t.events();
    expect(event).toMatchObject({ type: "wave_rising", topic_id: "t1", slot: SLOT, at: T });
    expect(JSON.parse(event?.detail ?? "null")).toEqual({ from: 100, to: 160, percent: 60 });
  });

  test("a wave already above the line at the previous run is not counted again", async () => {
    const t = setup();
    risingWave(t, "t1", 200, 150);
    expect(await t.run()).toEqual({ rising: [], wentFlat: [] });
    expect(t.events()).toEqual([]);
  });

  test("below the line: no event", async () => {
    const t = setup();
    risingWave(t, "t1", 149);
    expect(await t.run()).toEqual({ rising: [], wentFlat: [] });
  });

  test("the line comes from settings (risingPercent24h)", async () => {
    const t = setup();
    risingWave(t, "t1", 160);
    await changeSettings(t.orm, NOW, { risingPercent24h: 70 });
    expect(await t.run()).toEqual({ rising: [], wentFlat: [] });
    await changeSettings(t.orm, NOW, { risingPercent24h: 30 });
    // 40% at PREV already reaches a 30% line, so the wave did not cross now.
    expect(await t.run()).toEqual({ rising: [], wentFlat: [] });
    await changeSettings(t.orm, NOW, { risingPercent24h: 55 });
    expect(await t.run()).toEqual({ rising: ["t1"], wentFlat: [] });
  });

  test("no base 24 hours ago, or a base that was not up: no change, no event", async () => {
    const t = setup();
    // Formed less than 24 hours ago.
    t.point(PREV, "young", "up", 10);
    t.point(SLOT, "young", "up", 100);
    // Was an echo 24 hours ago.
    t.point(DAY_BEFORE, "echo", "echo", 10);
    t.point(SLOT, "echo", "up", 100);
    // Was flat 24 hours ago, back up now.
    t.point(DAY_BEFORE, "back", "flat", 10);
    t.point(SLOT, "back", "up", 100);
    // A base height of 0.
    t.point(DAY_BEFORE, "zero", "up", 0);
    t.point(SLOT, "zero", "up", 100);
    expect(await t.run()).toEqual({ rising: [], wentFlat: [] });
  });

  test("the base is the latest point at or before 24 hours ago", async () => {
    const t = setup();
    // No run at DAY_BEFORE: the base is the run before it, at 100, not the one after.
    t.point(DAY_BEFORE_PREV, "t1", "up", 100);
    t.point("20261118T0600", "t1", "up", 150);
    t.point(SLOT, "t1", "up", 160);
    expect(await t.run()).toEqual({ rising: ["t1"], wentFlat: [] });
    expect(JSON.parse(t.events()[0]?.detail ?? "null")).toMatchObject({ from: 100 });
  });

  test("the previous point's change is measured from its own base, 24 hours before it", async () => {
    const t = setup();
    // At PREV: 140 against 200 is -30%. Against this slot's base (100) it would be +40%.
    t.point(DAY_BEFORE_PREV, "t1", "up", 200);
    t.point(DAY_BEFORE, "t1", "up", 100);
    t.point(PREV, "t1", "up", 140);
    t.point(SLOT, "t1", "up", 160);
    await changeSettings(t.orm, NOW, { risingPercent24h: 30 });
    expect(await t.run()).toEqual({ rising: ["t1"], wentFlat: [] });
  });

  test("a previous point that was not up counts as below the line", async () => {
    const t = setup();
    t.point(DAY_BEFORE, "t1", "up", 100);
    t.point(PREV, "t1", "flat", 200);
    t.point(SLOT, "t1", "up", 200);
    expect(await t.run()).toEqual({ rising: ["t1"], wentFlat: [] });
  });

  test("only topics with a point in this slot are looked at", async () => {
    const t = setup();
    risingWave(t, "t1", 160);
    t.sqlite.run("DELETE FROM wave_points WHERE slot = ?1", [SLOT]);
    expect(await t.run()).toEqual({ rising: [], wentFlat: [] });
  });
});

describe("idempotent", () => {
  test("a rerun writes nothing new and returns the same output", async () => {
    const t = setup();
    risingWave(t, "r", 160);
    t.point(PREV, "f", "up", 40);
    t.point(SLOT, "f", "flat", 12);
    const first = await t.run();
    const rows = t.events();
    expect(rows).toHaveLength(2);
    expect(await t.run()).toEqual(first);
    expect(t.events()).toEqual(rows);
  });

  test("never writes wave_formed: the commit step does (#34)", async () => {
    const t = setup();
    t.sqlite.run(
      "INSERT INTO topics (id, slug, name, state, created_at) VALUES ('t1', 't1', 't1', 'echo', 0)",
    );
    for (const [id, group] of [
      ["e1", "hn"],
      ["e2", "lobsters"],
      ["e3", "github"],
    ]) {
      t.sqlite.run(
        `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id)
         VALUES (?1, ?2, ?3, 't', ?4, ?5, 't1')`,
        [id as string, `https://x.test/${id}`, group as string, T, SLOT],
      );
    }
    await computeStep().run(t.ctx());
    expect(t.sqlite.query("SELECT state FROM topics").get()).toEqual({ state: "up" });
    expect(await t.run()).toEqual({ rising: [], wentFlat: [] });
    expect(t.events()).toEqual([]);
  });
});

describe("after compute", () => {
  test("a wave compute turns flat gets its went_flat event", async () => {
    const t = setup();
    const formed = T - 10 * DAY;
    t.sqlite.run(
      `INSERT INTO topics (id, slug, name, state, created_at, formed_at)
       VALUES ('t1', 't1', 't1', 'up', 0, ?1)`,
      [formed],
    );
    t.sqlite.run(
      `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id)
       VALUES ('e1', 'https://x.test/e1', 'hn', 't', ?1, ?2, 't1')`,
      [formed, DAY_BEFORE],
    );
    t.point(PREV, "t1", "up", 5);
    await computeStep().run(t.ctx());
    expect(await t.run()).toEqual({ rising: [], wentFlat: ["t1"] });
  });
});
