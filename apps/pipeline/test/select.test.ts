/** The select step (M1-17, #33) on an in-memory database. */
import { describe, expect, test } from "bun:test";
import { slotStart } from "@bd/core";
import { drizzleOver } from "@bd/db";
import { runSlot, type StepContext } from "../src/core/runner.ts";
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
  /** Runs the step for `slot` through the runner, so its output is kept in `run_steps`. */
  const runRecorded = async (slot: string) => {
    const outcome = await runSlot(orm, () => NOW, slot, [selectStep()], {
      maxAttempts: 1,
      leaseMs: 60_000,
    });
    expect(outcome).toEqual({ status: "done", resumed: false });
    const row = sqlite
      .query("SELECT output FROM run_steps WHERE slot = ?1 AND step = 'select'")
      .get(slot) as { output: string };
    return JSON.parse(row.output) as SelectOutput;
  };
  const ids = (o: SelectOutput) => o.selected.map((s) => s.topicId);
  return { sqlite, orm, run, runRecorded, wave, summary, echoes, ids };
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

  test("a merged topic is not selected, even with an up point in this slot", async () => {
    const t = setup();
    t.wave("into", 5);
    t.wave("m", 50);
    t.sqlite.run("UPDATE topics SET merged_into = 'into' WHERE id = 'm'");
    expect(t.ids(await t.run())).toEqual(["into"]);
  });

  test("each wave's new echoes are counted from its own latest summary", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { rewriteAfterNewEchoes: 2 });
    t.wave("old", 10, [EARLIER, SLOT]);
    t.wave("recent", 20, [EARLIER, SLOT]);
    t.summary("old", EARLIER);
    t.summary("recent", PREV);
    t.echoes("old", PREV, 2);
    t.echoes("recent", PREV, 2); // as old as its summary: not new
    expect(t.ids(await t.run())).toEqual(["old"]);
  });

  test("a published summary from a later slot does not hide this slot's new echoes", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { rewriteAfterNewEchoes: 2 });
    t.wave("t1", 10, [EARLIER, SLOT]);
    t.summary("t1", EARLIER);
    t.echoes("t1", PREV, 2);
    t.summary("t1", NEXT);
    expect(await t.run()).toEqual({
      selected: [{ topicId: "t1", reason: "new_echoes" }],
      waiting: [],
    });
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
    const first = await t.runRecorded(PREV);
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

  test("waves wait in the order they were left over, and only an earlier finished run counts", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { summariesPerRun: 1 });
    for (const [id, h] of [
      ["a", 30],
      ["b", 20],
      ["c", 10],
    ] as const) {
      t.wave(id, h, [EARLIER, PREV, SLOT]);
    }
    expect((await t.runRecorded(EARLIER)).waiting).toEqual(["b", "c"]);
    t.summary("a", EARLIER);
    t.wave("z", 99, [PREV, SLOT]);
    expect(await t.runRecorded(PREV)).toEqual({
      selected: [{ topicId: "b", reason: "formed" }],
      waiting: ["c", "z"],
    });
    // A select output from a later slot is not read.
    t.sqlite.run(
      `INSERT INTO run_steps (slot, step, status, attempts, output, finished_at)
       VALUES (?1, 'select', 'done', 1, '{"selected":[],"waiting":["z","c"]}', 0)`,
      [NEXT],
    );
    t.summary("b", PREV);
    expect(t.ids(await t.run())).toEqual(["c"]);
  });

  test("a failed select step is skipped: the latest finished one gives the waiting list", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { summariesPerRun: 1 });
    t.wave("high", 30, [EARLIER, PREV, SLOT]);
    t.wave("low", 10, [EARLIER, PREV, SLOT]);
    expect((await t.runRecorded(EARLIER)).waiting).toEqual(["low"]);
    t.summary("high", EARLIER);
    t.wave("new", 99, [PREV, SLOT]);
    t.sqlite.run(
      `INSERT INTO run_steps (slot, step, status, attempts, output, error, finished_at)
       VALUES (?1, 'select', 'failed', 3, NULL, 'Error: x', 0)`,
      [PREV],
    );
    expect(t.ids(await t.run())).toEqual(["low"]);
  });

  test("of two earlier finished select steps, the latest gives the waiting list", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { summariesPerRun: 1 });
    t.wave("older", 10, [EARLIER, PREV, SLOT]);
    t.wave("latest", 20, [PREV, SLOT]);
    t.wave("top", 99, [SLOT]);
    for (const [slot, waiting] of [
      [EARLIER, "older"],
      [PREV, "latest"],
    ] as const) {
      t.sqlite.run(
        `INSERT INTO run_steps (slot, step, status, attempts, output, finished_at)
         VALUES (?1, 'select', 'done', 1, ?2, 0)`,
        [slot, JSON.stringify({ selected: [], waiting: [waiting] })],
      );
    }
    expect(t.ids(await t.run())).toEqual(["latest"]);
  });

  test("a wave left waiting goes before one whose attempt in the same slot was discarded", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { summariesPerRun: 1 });
    t.wave("high", 99, [PREV, SLOT]);
    t.wave("low", 1, [PREV, SLOT]);
    expect(await t.runRecorded(PREV)).toEqual({
      selected: [{ topicId: "high", reason: "formed" }],
      waiting: ["low"],
    });
    t.summary("high", PREV, "discarded"); // attempted in the slot it formed
    expect(await t.run()).toEqual({
      selected: [{ topicId: "low", reason: "formed" }],
      waiting: ["high"],
    });
  });

  test("a rewrite made due by a late-assigned echo goes behind a wave already waiting", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { summariesPerRun: 1, rewriteAfterNewEchoes: 1 });
    t.wave("target", 1, ["20261119T0100", PREV, SLOT]);
    t.summary("target", "20261119T0100");
    // First seen at 02:00, before the other waves formed; no topic yet.
    t.sqlite.run(
      `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id)
       VALUES ('late', 'https://x.test/late', 'g', 't', ?1, '20261119T0200', NULL)`,
      [slotStart("20261119T0200")],
    );
    t.wave("first", 50, [PREV, SLOT]);
    t.wave("waiting", 10, [PREV, SLOT]);
    expect(await t.runRecorded(PREV)).toEqual({
      selected: [{ topicId: "first", reason: "formed" }],
      waiting: ["waiting"],
    });
    t.summary("first", PREV);
    // The assign step places the echo in this run, as it does for a retried echo.
    t.sqlite.run("UPDATE echoes SET topic_id = 'target' WHERE id = 'late'");
    expect(await t.run()).toEqual({
      selected: [{ topicId: "waiting", reason: "formed" }],
      waiting: ["target"],
    });
  });

  test("running the step again returns the same output and writes no row once settings exist", async () => {
    const t = setup();
    await changeSettings(t.orm, NOW, { summariesPerRun: 1 });
    t.wave("a", 4);
    t.wave("b", 3);
    const tables = (
      t.sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]
    ).map((r) => r.name);
    const count = () =>
      tables.map(
        (name) => (t.sqlite.query(`SELECT COUNT(*) AS n FROM "${name}"`).get() as { n: number }).n,
      );
    const before = count();
    const first = await t.run();
    expect(await t.run()).toEqual(first);
    expect(count()).toEqual(before);
  });
});
