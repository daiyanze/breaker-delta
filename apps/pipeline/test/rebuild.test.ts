/**
 * Rebuild (M1-21, #37). This is the CI check: a history is built by the real
 * compute and changes steps, run by the step runner over several slots with
 * settings changed between runs; rebuild must recompute exactly what they
 * stored, and must list every difference once a stored row is tampered with.
 * The inputs (topics, echoes, heat) are synthetic rows, never fetched content.
 */
import { Database as SQLite } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { slotId, slotStart } from "@bd/core";
import { drizzleOver } from "@bd/db";
import { main } from "../../../scripts/rebuild.ts";
import { changesStep } from "../src/core/changes.ts";
import { computeStep } from "../src/core/compute.ts";
import { type Difference, diffRows, formatDifference, rebuild } from "../src/core/rebuild.ts";
import { runSlot } from "../src/core/runner.ts";
import { changeSettings } from "../src/core/settings.ts";
import { sqliteDatabase } from "../src/local/database.ts";
import { rebuildFile } from "../src/local/rebuild.ts";
import { migratedDatabase } from "./helpers.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = slotStart("20261119T0500");
const slot = (ms: number) => slotId(ms, 60);
/** Five minutes into a slot: when its run executes. */
const during = (ms: number) => ms + 5 * 60_000;

function topic(sqlite: SQLite, id: string, at: number) {
  sqlite.run("INSERT INTO topics (id, slug, name, created_at) VALUES (?1, ?1, ?1, ?2)", [id, at]);
}

function echo(sqlite: SQLite, id: string, topicId: string | null, group: string, at: number) {
  sqlite.run(
    `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id)
     VALUES (?1, ?2, ?3, 't', ?4, ?5, ?6)`,
    [id, `https://x.test/${id}`, group, at, slot(at), topicId],
  );
}

function heat(sqlite: SQLite, id: string, at: number, value: number) {
  sqlite.run("INSERT INTO echo_metrics (echo_id, slot, heat, seen_at) VALUES (?1, ?2, ?3, ?4)", [
    id,
    slot(at),
    value,
    at,
  ]);
}

/**
 * Seven runs over four days. Topic `a` forms at run 2 and `b` at run 3 only
 * because the threshold dropped to 2 in between (with 2 from the start, `a`
 * would form at run 1); both go flat at run 5 after `calmAfterDays` drops to
 * 1, and `a` comes back up at run 6. Run 4 is a slot whose run failed before
 * compute; run 7 changes height settings to group normalisation.
 */
async function history() {
  const { sqlite, db } = migratedDatabase();
  const orm = drizzleOver(db);
  const steps = [computeStep(), changesStep()];
  const run = async (at: number) => {
    const outcome = await runSlot(orm, () => during(at), slot(at), steps, {
      maxAttempts: 1,
      leaseMs: 60_000,
    });
    expect(outcome).toEqual({ status: "done", resumed: false });
  };

  // Run 1: `a` has two groups, `b` one; one echo is not assigned.
  topic(sqlite, "a", T0);
  topic(sqlite, "b", T0);
  echo(sqlite, "a1", "a", "hn", T0 + 60_000);
  echo(sqlite, "a2", "a", "lobsters", T0 + 120_000);
  echo(sqlite, "b1", "b", "hn", T0 + 180_000);
  echo(sqlite, "x1", null, "github", T0 + 240_000);
  heat(sqlite, "a1", T0, 40);
  heat(sqlite, "a2", T0, 12);
  await run(T0);

  // Run 2: `a` reaches three groups and forms; heat moves.
  const t2 = T0 + HOUR;
  echo(sqlite, "a3", "a", "github", t2 + 60_000);
  heat(sqlite, "a1", t2, 90);
  heat(sqlite, "a3", t2, 7);
  await run(t2);
  await changeSettings(orm, during(t2) + 60_000, { waveThreshold: 2 });

  // Run 3: `b` forms on two groups under the new threshold.
  const t3 = T0 + 2 * HOUR;
  echo(sqlite, "b2", "b", "lobsters", t3 + 60_000);
  heat(sqlite, "b2", t3, 25);
  await run(t3);
  await changeSettings(orm, during(t3) + 60_000, { calmAfterDays: 1 });

  // Run 4 fails before compute: the slot has no compute row and no points.
  const t4 = T0 + 3 * HOUR;
  const failed = await runSlot(
    orm,
    () => during(t4),
    slot(t4),
    [
      {
        name: "scan",
        run: async () => {
          throw new Error("down");
        },
      },
      ...steps,
    ],
    { maxAttempts: 1, leaseMs: 60_000 },
  );
  expect(failed.status).toBe("failed");

  // Run 5: two days later, both waves have gone flat.
  const t5 = T0 + 2 * DAY;
  await run(t5);

  // Run 6: `a` gets a new echo and comes back up.
  const t6 = t5 + HOUR;
  echo(sqlite, "a4", "a", "hn", t6 + 60_000);
  heat(sqlite, "a4", t6, 300);
  await run(t6);
  await changeSettings(orm, during(t6) + 60_000, {
    heatNormalisation: "group",
    heatReferencePercentile: 50,
    maxEchoesPerGroup: 1,
  });

  // Run 7: same echoes, new height settings.
  const t7 = t6 + HOUR;
  heat(sqlite, "a4", t7, 500);
  await run(t7);

  const scratch = () => drizzleOver(migratedCopy(sqlite));
  return { sqlite, orm, scratch, slots: [T0, t2, t3, t5, t6, t7].map(slot) };
}

/** An in-memory copy of `sqlite`, as the local adapter makes. */
function migratedCopy(sqlite: SQLite) {
  return sqliteDatabase(SQLite.deserialize(sqlite.serialize()));
}

const state = (sqlite: SQLite) => ({
  points: sqlite.query("SELECT * FROM wave_points ORDER BY slot, topic_id").all(),
  topics: sqlite.query("SELECT * FROM topics ORDER BY id").all(),
});

describe("rebuild", () => {
  test("the history covers forming, going flat, coming back and ranking", async () => {
    const { sqlite } = await history();
    const rows = sqlite
      .query("SELECT slot, topic_id, state, rank FROM wave_points ORDER BY slot, topic_id")
      .all() as { slot: string; topic_id: string; state: string; rank: number | null }[];
    const by = (s: string) => rows.filter((r) => r.slot === s).map((r) => [r.topic_id, r.state]);
    expect(by(slot(T0))).toEqual([
      ["a", "echo"],
      ["b", "echo"],
    ]);
    expect(by(slot(T0 + HOUR))).toEqual([
      ["a", "up"],
      ["b", "echo"],
    ]);
    expect(by(slot(T0 + 2 * HOUR))).toEqual([
      ["a", "up"],
      ["b", "up"],
    ]);
    expect(by(slot(T0 + 2 * DAY))).toEqual([
      ["a", "flat"],
      ["b", "flat"],
    ]);
    expect(by(slot(T0 + 2 * DAY + HOUR))).toEqual([["a", "up"]]);
  });

  test("recomputes exactly what the compute step stored", async () => {
    const h = await history();
    const result = await rebuild(h.orm, h.scratch());
    expect(result.differences).toEqual([]);
    expect(result.slots).toEqual(h.slots);
    expect(result.points).toBe(10);
    expect(result.topics).toBe(2);
  });

  test("never writes the stored database", async () => {
    const h = await history();
    const before = state(h.sqlite);
    await rebuild(h.orm, h.scratch());
    expect(state(h.sqlite)).toEqual(before);
  });

  test("uses the settings in force when each slot ran", async () => {
    const h = await history();
    // Without the history, every slot replays under the current settings,
    // and their threshold of 2 forms `a` at run 1 instead of run 2.
    h.sqlite.run("DELETE FROM settings_history");
    const { differences } = await rebuild(h.orm, h.scratch());
    expect(differences).toContainEqual({
      table: "topic",
      topicId: "a",
      field: "formed_at",
      stored: T0 + HOUR,
      rebuilt: T0,
    });
  });

  test("an echo assigned after its slot ran shows as a difference", async () => {
    const h = await history();
    // `x1` was first seen in run 1 unassigned; a later assign places it in `b`.
    h.sqlite.run("UPDATE echoes SET topic_id = 'b' WHERE id = 'x1'");
    const { differences } = await rebuild(h.orm, h.scratch());
    expect(differences).toContainEqual({
      table: "point",
      slot: slot(T0),
      topicId: "b",
      field: "source_count",
      stored: 1,
      rebuilt: 2,
    });
  });

  test("an echo removed after its slot ran shows as a difference", async () => {
    const h = await history();
    h.sqlite.run("DELETE FROM echoes WHERE id = 'b1'");
    const { differences } = await rebuild(h.orm, h.scratch());
    expect(differences).toContainEqual({
      table: "point",
      slot: slot(T0),
      topicId: "b",
      field: "row",
      stored: "present",
      rebuilt: null,
    });
  });

  test("on tampered rows, lists every difference", async () => {
    const h = await history();
    const s3 = slot(T0 + 2 * HOUR);
    const s7 = slot(T0 + 2 * DAY + 2 * HOUR);
    h.sqlite.run(
      "UPDATE wave_points SET height = height + 0.5 WHERE slot = ?1 AND topic_id = 'a'",
      [s3],
    );
    const rankB = h.sqlite
      .query("SELECT rank FROM wave_points WHERE slot = ?1 AND topic_id = 'b'")
      .get(s3) as { rank: number };
    h.sqlite.run("UPDATE wave_points SET rank = 9 WHERE slot = ?1 AND topic_id = 'b'", [s3]);
    h.sqlite.run("DELETE FROM wave_points WHERE slot = ?1 AND topic_id = 'a'", [s7]);
    h.sqlite.run(
      `INSERT INTO wave_points (slot, topic_id, state, height, rank, source_count, echo_count)
       VALUES (?1, 'b', 'up', 1, 1, 2, 2)`,
      [s7],
    );
    h.sqlite.run("UPDATE topics SET formed_at = 0, state = 'flat' WHERE id = 'a'");
    const height = h.sqlite
      .query("SELECT height FROM wave_points WHERE slot = ?1 AND topic_id = 'a'")
      .get(s3) as { height: number };

    const { differences } = await rebuild(h.orm, h.scratch());
    expect(differences).toEqual<Difference[]>([
      {
        table: "point",
        slot: s3,
        topicId: "a",
        field: "height",
        stored: height.height,
        rebuilt: height.height - 0.5,
      },
      { table: "point", slot: s3, topicId: "b", field: "rank", stored: 9, rebuilt: rankB.rank },
      { table: "point", slot: s7, topicId: "b", field: "row", stored: "present", rebuilt: null },
      { table: "point", slot: s7, topicId: "a", field: "row", stored: null, rebuilt: "present" },
      { table: "topic", topicId: "a", field: "state", stored: "flat", rebuilt: "up" },
      { table: "topic", topicId: "a", field: "formed_at", stored: 0, rebuilt: T0 + HOUR },
    ]);
  });
});

describe("diffRows", () => {
  test("compares every field and reports rows on one side", () => {
    const key = (r: { id: string }) => ({ topicId: r.id });
    expect(
      diffRows(
        "topic",
        [
          { id: "a", v: 1 },
          { id: "b", v: 2 },
        ],
        [
          { id: "a", v: 1 },
          { id: "c", v: 3 },
        ],
        key,
        ["v"],
      ),
    ).toEqual([
      { table: "topic", topicId: "b", field: "row", stored: "present", rebuilt: null },
      { table: "topic", topicId: "c", field: "row", stored: null, rebuilt: "present" },
    ]);
  });

  test("a null and a zero differ", () => {
    const key = (r: { id: string }) => ({ topicId: r.id });
    expect(diffRows("topic", [{ id: "a", v: null }], [{ id: "a", v: 0 }], key, ["v"])).toEqual([
      { table: "topic", topicId: "a", field: "v", stored: null, rebuilt: 0 },
    ]);
  });
});

describe("the command", () => {
  async function onFile() {
    const h = await history();
    const dir = mkdtempSync(join(tmpdir(), "bd-rebuild-"));
    h.sqlite.run(`VACUUM INTO '${join(dir, "content.db")}'`);
    const file = new SQLite(join(dir, "content.db"));
    const lines: string[] = [];
    const io = { out: (l: string) => lines.push(l), env: {} };
    return { dir, file, lines, io };
  }

  test("exits 0 when the file matches, and leaves the file as it was", async () => {
    const { dir, file, lines, io } = await onFile();
    const before = state(file);
    expect(await main(["--data-dir", dir], io)).toBe(0);
    expect(lines).toEqual(["rebuild matches: 6 slots, 10 points, 2 topics"]);
    expect(state(file)).toEqual(before);
    expect((await rebuildFile(join(dir, "content.db"))).differences).toEqual([]);
  });

  test("exits 1 and prints each difference when a row was tampered with", async () => {
    const { dir, file, lines, io } = await onFile();
    file.run("UPDATE topics SET went_flat_at = 1 WHERE id = 'b'");
    expect(await main(["--data-dir", dir], io)).toBe(1);
    expect(lines).toEqual([
      "rebuild differs: 1 differences (6 slots, 10 points, 2 topics)",
      formatDifference({
        table: "topic",
        topicId: "b",
        field: "went_flat_at",
        stored: 1,
        rebuilt: T0 + 2 * DAY,
      }),
    ]);
    expect(lines[1]).toBe(`topic b went_flat_at: stored 1, rebuilt ${T0 + 2 * DAY}`);
  });

  test("works on a file in WAL mode, as local mode leaves it", async () => {
    // startPipeline (src/local/server.ts) sets journal_mode = WAL; VACUUM INTO
    // does not, so the tests above alone would miss a WAL-only failure (L9).
    const { dir, file, lines, io } = await onFile();
    expect(file.query("PRAGMA journal_mode = WAL").get()).toEqual({ journal_mode: "wal" });
    const before = state(file);
    expect(await main(["--data-dir", dir], io)).toBe(0);
    expect(lines).toEqual(["rebuild matches: 6 slots, 10 points, 2 topics"]);
    expect(state(file)).toEqual(before);
    file.close();
  });

  test("exits 2 when there is no database", async () => {
    const lines: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), "bd-rebuild-none-"));
    expect(await main(["--data-dir", dir], { out: (l) => lines.push(l), env: {} })).toBe(2);
    expect(lines[0]).toStartWith("no database at ");
  });
});
