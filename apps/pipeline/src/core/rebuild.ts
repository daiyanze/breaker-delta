/**
 * Rebuild (M1-21, #37): recompute every wave point and topic state from the
 * inputs (echoes, heat, assignments, settings) and compare with what is
 * stored. Nothing here has its own formula: it replays the compute step
 * (`compute.ts`, which takes every number from `@bd/core`) slot by slot on a
 * scratch copy of the database, then diffs the copy against the original.
 *
 * 1. **Stored.** Every `wave_points` row and every topic's state and dates
 *    are read from `stored`, which is only read.
 * 2. **Reset.** In `scratch`, a copy of `stored` the caller made, every
 *    point is deleted and every topic goes back to `echo` with no dates:
 *    the state before the first run.
 * 3. **Replay.** For each slot the compute step ran in (a done `compute`
 *    row in `run_steps`, or a stored point), oldest first, the scratch
 *    settings row is set to the settings in force when that step ran: the
 *    latest `settings_history` row changed at or before the step's
 *    `finished_at` (the slot's start when the step left no row). Then the
 *    compute step runs on the scratch copy for that slot.
 * 4. **Compare.** Every point by `(slot, topic)`, field by field, and every
 *    topic's state, `formed_at` and `went_flat_at`. Heights are compared
 *    exactly: the same code on the same inputs gives the same number.
 *
 * What replay cannot see: inputs that changed after a slot ran. An echo
 * assigned in a later run (assign failed the first time) or removed by
 * retention (#38) changes what an earlier slot recomputes to, and shows
 * here as a difference (both tested); a merge, split or reassign (#77, not
 * built yet) moves echoes the same way. Echoes do not record when they were
 * assigned, so such a difference cannot be told apart from a wrong stored
 * row.
 *
 * Settings are matched by time: the compute step reads them when its
 * attempt starts, before `finished_at`, so a change made while that attempt
 * ran is taken as in force for it.
 *
 * The result holds slot and topic ids and numbers only, never fetched text.
 */
import { slotStart } from "@bd/core";
import { type Db, runSteps, settingsHistory, topics, wavePoints } from "@bd/db";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { computeStep } from "./compute.ts";

/** One field of one stored row that the replay computed differently. */
export interface Difference {
  /** `point` is a `wave_points` row; `topic` is a `topics` row. */
  table: "point" | "topic";
  /** The point's slot; absent for a topic. */
  slot?: string;
  topicId: string;
  /** The column, or `row` when the whole row is only on one side. */
  field: string;
  /** What is stored; null when the row is only in the rebuild. */
  stored: string | number | null;
  /** What the replay computed; null when the row is only stored. */
  rebuilt: string | number | null;
}

export interface RebuildResult {
  /** Slots replayed, oldest first. */
  slots: string[];
  points: number;
  topics: number;
  differences: Difference[];
}

interface PointRow {
  slot: string;
  topic_id: string;
  state: string;
  height: number;
  rank: number | null;
  source_count: number;
  echo_count: number;
}

interface TopicRow {
  id: string;
  state: string;
  formed_at: number | null;
  went_flat_at: number | null;
}

const POINT_FIELDS = ["state", "height", "rank", "source_count", "echo_count"] as const;
const TOPIC_FIELDS = ["state", "formed_at", "went_flat_at"] as const;

const readPoints = (db: Db): Promise<PointRow[]> =>
  db
    .select({
      slot: wavePoints.slot,
      topic_id: wavePoints.topicId,
      state: wavePoints.state,
      height: wavePoints.height,
      rank: wavePoints.rank,
      source_count: wavePoints.sourceCount,
      echo_count: wavePoints.echoCount,
    })
    .from(wavePoints)
    .orderBy(asc(wavePoints.slot), asc(wavePoints.topicId));

const readTopics = (db: Db): Promise<TopicRow[]> =>
  db
    .select({
      id: topics.id,
      state: topics.state,
      formed_at: topics.formedAt,
      went_flat_at: topics.wentFlatAt,
    })
    .from(topics)
    .orderBy(asc(topics.id));

/** Each slot compute ran in, with the time its settings are read at. */
async function computeSlots(db: Db): Promise<{ slot: string; at: number }[]> {
  const [done, pointSlots] = await Promise.all([
    db
      .select({ slot: runSteps.slot, finishedAt: runSteps.finishedAt })
      .from(runSteps)
      .where(and(eq(runSteps.step, "compute"), eq(runSteps.status, "done"))),
    db.selectDistinct({ slot: wavePoints.slot }).from(wavePoints),
  ]);
  const at = new Map<string, number>();
  for (const { slot } of pointSlots) at.set(slot, slotStart(slot));
  for (const { slot, finishedAt } of done) at.set(slot, finishedAt);
  return [...at]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([slot, time]) => ({ slot, at: time }));
}

/** The settings JSON in force at `at`: the latest history row changed by then. */
async function settingsAt(db: Db, at: number): Promise<string | null> {
  const row = await db
    .select({ json: settingsHistory.json })
    .from(settingsHistory)
    .where(lte(settingsHistory.changedAt, at))
    .orderBy(desc(settingsHistory.changedAt), desc(settingsHistory.id))
    .limit(1)
    .get();
  return row?.json ?? null;
}

/**
 * Compare two lists of rows keyed by `key`, field by field. A row on one
 * side only is one `row` difference.
 */
export function diffRows<T extends object>(
  table: Difference["table"],
  stored: readonly T[],
  rebuilt: readonly T[],
  key: (row: T) => { slot?: string; topicId: string },
  fields: readonly (keyof T & string)[],
): Difference[] {
  const id = (row: T) => {
    const k = key(row);
    return `${k.slot ?? ""}\u0000${k.topicId}`;
  };
  const byId = new Map(rebuilt.map((r) => [id(r), r]));
  const out: Difference[] = [];
  const where = (row: T) => {
    const k = key(row);
    return k.slot === undefined ? { topicId: k.topicId } : { slot: k.slot, topicId: k.topicId };
  };
  for (const s of stored) {
    const r = byId.get(id(s));
    byId.delete(id(s));
    if (!r) {
      out.push({ table, ...where(s), field: "row", stored: "present", rebuilt: null });
      continue;
    }
    for (const f of fields) {
      const a = s[f] as string | number | null;
      const b = r[f] as string | number | null;
      if (a !== b) out.push({ table, ...where(s), field: f, stored: a, rebuilt: b });
    }
  }
  for (const r of byId.values()) {
    out.push({ table, ...where(r), field: "row", stored: null, rebuilt: "present" });
  }
  return out;
}

/**
 * Replay compute on `scratch` and compare with `stored`. `scratch` must be a
 * copy of `stored` that may be thrown away: its points, topic states and
 * settings row are overwritten. Never pass the content database itself.
 */
export async function rebuild(stored: Db, scratch: Db): Promise<RebuildResult> {
  const [points, topicRows, slots] = await Promise.all([
    readPoints(stored),
    readTopics(stored),
    computeSlots(stored),
  ]);

  await scratch.batch([
    scratch.run(sql`DELETE FROM wave_points`),
    scratch.run(sql`UPDATE topics SET state = 'echo', formed_at = NULL, went_flat_at = NULL`),
  ]);
  const step = computeStep();
  for (const { slot, at } of slots) {
    const json = await settingsAt(stored, at);
    if (json !== null) {
      await scratch.run(sql`UPDATE settings SET json = ${json}, updated_at = ${at} WHERE id = 1`);
    }
    await step.run({ slot, db: scratch, now: () => at, outputs: new Map() });
  }

  const [rebuiltPoints, rebuiltTopics] = await Promise.all([
    readPoints(scratch),
    readTopics(scratch),
  ]);
  return {
    slots: slots.map((s) => s.slot),
    points: points.length,
    topics: topicRows.length,
    differences: [
      ...diffRows(
        "point",
        points,
        rebuiltPoints,
        (p) => ({ slot: p.slot, topicId: p.topic_id }),
        POINT_FIELDS,
      ),
      ...diffRows("topic", topicRows, rebuiltTopics, (t) => ({ topicId: t.id }), TOPIC_FIELDS),
    ],
  };
}

/** One line per difference, for the command's output. */
export function formatDifference(d: Difference): string {
  const where = d.slot === undefined ? `topic ${d.topicId}` : `point ${d.slot} ${d.topicId}`;
  return `${where} ${d.field}: stored ${String(d.stored)}, rebuilt ${String(d.rebuilt)}`;
}
