/** The select step (M1-17, #33) on an in-memory database. */
import { describe, expect, test } from "bun:test";
import { slotStart } from "@bd/core";
import { drizzleOver } from "@bd/db";
import type { StepContext } from "../src/core/runner.ts";
import { type SelectOutput, selectStep } from "../src/core/select.ts";
import { changeSettings } from "../src/core/settings.ts";
import { migratedDatabase, NOW, SLOT } from "./helpers.ts";

const PREV = "20261119T0400";
const EARLIER = "20261119T0300";
const NEXT = "20261119T0600";

function setup() {
  const { db, sqlite } = migratedDatabase();
  const orm = drizzleOver(db);
  const ctx = (slot: string): StepContext => ({
    slot,
    db: orm,
    now: () => NOW,
    outputs: new Map(),
  });
  const run = async (slot = SLOT) => (await selectStep().run(ctx(slot))) as SelectOutput;
  /** A topic with an up point of `height` in each of `slots`, formed at the first. */
  const wave = (id: string, height: number, slots = [SLOT], state = "up") => {
    sqlite.run(
      `INSERT INTO topics (id, slug, name, state, created_at, formed_at)
       VALUES (?1, ?1, ?1, ?2, 0, ?3)`,
      [id, state, slotStart(slots[0] ?? SLOT)],
    );
    for (const slot of slots) {
      sqlite.run(
        `INSERT INTO wave_points (slot, topic_id, state, height, rank, source_count, echo_count)
         VALUES (?1, ?2, ?3, ?4, NULL, 3, 3)`,
        [slot, id, state, height],
      );
    }
  };
  let n = 0;
  const summary = (topicId: string, slot: string, status = "published") => {
    n++;
    sqlite.run(
      `INSERT INTO summaries (id, topic_id, version, status, reason, writer, slot, created_at)
       VALUES (?1, ?2, ?3, ?4, 'formed', 'w', ?5, 0)`,
      [`s${n}`, topicId, status === "published" ? n : null, status, slot],
    );
  };
  const echoes = (topicId: string, slot: string, count: number) => {
    for (let i = 0; i < count; i++) {
      n++;
      sqlite.run(
        `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id)
         VALUES (?1, ?2, 'g', 't', ?3, ?4, ?5)`,
        [`e${n}`, `https://x.test/${n}`, slotStart(slot), slot, topicId],
      );
    }
  };
  const ids = (o: SelectOutput) => o.selected.map((s) => s.topicId);
  return { sqlite, orm, run, wave, summary, echoes, ids };
}

describe("which waves are due", () => {
  test("a wave with no published summary is selected as formed", async () => {
    const t = setup();
    t.wave("t1", 10);
    expect(await t.run()).toEqual({ selected: [{ topicId: "t1", reason: "formed" }], waiting: [] });
  });

  test("echo topics, flat waves and topics with no point in this slot are not selected", async () => {
    const t = setup();
    t.wave("echo", 50, [SLOT], "echo");
    t.wave("flat", 50, [SLOT], "flat");
    t.wave("old", 50, [PREV]);
    expect(await t.run()).toEqual({ selected: [], waiting: [] });
  });

  test("a summarised wave is selected as new_echoes once rewriteAfterNewEchoes echoes are newer", async () => {
    const t = setup();
    t.wave("t1", 10, [EARLIER, SLOT]);
    t.summary("t1", EARLIER);
    t.echoes("t1", EARLIER, 9); // as old as the summary: not new
    t.echoes("t1", PREV, 2);
    t.echoes("t1", SLOT, 2);
    t.echoes("t1", NEXT, 5); // after this slot: not read
    expect(await t.run()).toEqual({ selected: [], waiting: [] }); // 4 of the default 5
    t.echoes("t1", SLOT, 1);
    expect(await t.run()).toEqual({
      selected: [{ topicId: "t1", reason: "new_echoes" }],
      waiting: [],
    });
  });

  test("the rewrite rule comes from settings (rewriteAfterNewEchoes)", async () => {
    const t = setup();
    t.wave("t1", 10, [EARLIER, SLOT]);
    t.summary("t1", EARLIER);
    t.echoes("t1", SLOT, 2);
    expect((await t.run()).selected).toEqual([]);
    await changeSettings(t.orm, NOW, { rewriteAfterNewEchoes: 2 });
    expect((await t.run()).selected).toEqual([{ topicId: "t1", reason: "new_echoes" }]);
  });

  test("new echoes are counted from the latest published summary, not a discarded one", async () => {
    const t = setup();
    t.wave("t1", 10, [EARLIER, SLOT]);
    t.summary("t1", EARLIER);
    t.echoes("t1", PREV, 5);
    t.summary("t1", PREV, "discarded");
    expect(t.ids(await t.run())).toEqual(["t1"]);
    t.summary("t1", PREV);
    expect(t.ids(await t.run())).toEqual([]);
  });

  test("a summary from a later slot is not read", async () => {
    const t = setup();
    t.wave("t1", 10);
    t.summary("t1", NEXT);
    expect(t.ids(await t.run())).toEqual(["t1"]);
  });
});

describe("budget", () => {
  test("at most summariesPerRun waves, highest first; the rest wait", async () => {
    const t = setup();
    t.wave("a", 4);
    t.wave("b", 30);
    t.wave("c", 2);
    t.wave("d", 10);
    expect(await t.run()).toEqual({
      selected: [
        { topicId: "b", reason: "formed" },
        { topicId: "d", reason: "formed" },
        { topicId: "a", reason: "formed" },
      ],
      waiting: ["c"],
    });
    await changeSettings(t.orm, NOW, { summariesPerRun: 0 });
    expect(await t.run()).toEqual({ selected: [], waiting: ["b", "d", "a", "c"] });
  });

  test("a wave over budget is selected on the next run, before a higher one due then", async () => {
    const t = setup();
    for (const [id, h] of [
      ["a", 40],
      ["b", 30],
      ["c", 20],
      ["d", 10],
    ] as const) {
      t.wave(id, h, [PREV, SLOT]);
    }
    const first = await t.run(PREV);
    expect(first.waiting).toEqual(["d"]);
    // The next run: the three selected got a summary; a new, higher wave formed.
    for (const id of t.ids(first)) t.summary(id, PREV);
    t.wave("e", 99);
    expect(await t.run()).toEqual({
      selected: [
        { topicId: "d", reason: "formed" },
        { topicId: "e", reason: "formed" },
      ],
      waiting: [],
    });
    await changeSettings(t.orm, NOW, { summariesPerRun: 1 });
    expect(await t.run()).toEqual({
      selected: [{ topicId: "d", reason: "formed" }],
      waiting: ["e"],
    });
  });

  test("a wave whose attempt was discarded waits behind waves due before that attempt", async () => {
    const t = setup();
    t.wave("failed", 99, [EARLIER, SLOT]);
    t.wave("older", 1, [EARLIER, SLOT]);
    await changeSettings(t.orm, NOW, { summariesPerRun: 1 });
    expect(t.ids(await t.run())).toEqual(["failed"]); // same due time: higher first
    t.summary("failed", PREV, "discarded");
    expect(await t.run()).toEqual({
      selected: [{ topicId: "older", reason: "formed" }],
      waiting: ["failed"],
    });
  });

  test("running the step again returns the same output and writes nothing", async () => {
    const t = setup();
    t.wave("a", 4);
    t.wave("b", 3);
    const count = () =>
      t.sqlite
        .query("SELECT (SELECT COUNT(*) FROM summaries) + (SELECT COUNT(*) FROM events) AS n")
        .get();
    const before = count();
    const first = await t.run();
    expect(await t.run()).toEqual(first);
    expect(count()).toEqual(before);
  });
});
