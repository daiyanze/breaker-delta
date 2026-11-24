/**
 * The changes step (M1-14, #30): the `wave_rising` and `went_flat` events
 * of this run, read from the `wave_points` the compute step wrote. Whether a
 * wave rose comes from `@bd/core` (`change24h`, `crossedRising`); this step
 * only reads the points and writes the events.
 *
 * - **went_flat:** the topic's point in this slot is `flat` and its point
 *   before is `up`.
 * - **wave_rising:** the point in this slot is `up`, and its 24-hour change
 *   reaches `risingPercent24h` while the previous point's did not. A
 *   point's base is the topic's latest point at or before 24 hours before
 *   it; it counts only when that point is `up`. So a wave formed less than
 *   24 hours ago has no change yet, and neither has one that was not up 24
 *   hours ago (an echo then, or flat then). A wave that was up 24 hours ago
 *   is measured whatever it was in between, so one that went flat and came
 *   back inside 24 hours can cross. The base has no age limit: after runs
 *   were missed it can be older than 24 hours.
 *   `detail` is `{ from, to, percent }`.
 *
 * `wave_formed` is not written here: the commit step (#34) writes it with
 * the first summary and the prediction (invariant 5; owner's decision,
 * 2026-11-24, #237 and #30).
 *
 * Every event is dated at the slot's start. The events table's partial
 * unique indexes allow one of each type per topic and slot, so a retried or
 * resumed attempt inserts nothing new and returns the same output.
 */
import { change24h, crossedRising, slotId, slotStart } from "@bd/core";
import { type Db, wavePoints } from "@bd/db";
import { asc, eq, sql } from "drizzle-orm";
import type { Step } from "./runner.ts";
import { readSettings } from "./settings.ts";

/** What the step returns; the runner stores it in `run_steps.output`. */
export interface ChangesOutput {
  /** Waves that crossed the rising line in this slot. */
  rising: string[];
  /** Waves that went flat in this slot. */
  wentFlat: string[];
}

const DAY_MS = 86_400_000;
/** Rows per `json_each` parameter, as in compute. */
const CHUNK = 500;

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

interface Point {
  slot: string;
  state: string;
  height: number;
}

/** The slot id of the minute 24 hours before `slot` starts; slot ids sort as text. */
const dayBefore = (slot: string) => slotId(slotStart(slot) - DAY_MS, 1);

/** The height a 24-hour change is measured from: the base point's, when it was up. */
const baseHeight = (p: Point | null) => (p !== null && p.state === "up" ? p.height : null);

const parse = (json: string | null): Point | null => (json === null ? null : JSON.parse(json));

/*
 * The subqueries below name the outer row as `wave_points.<column>`, not
 * `${wavePoints.<column>}`: in a select field drizzle renders a column
 * unqualified (`"slot"`), which inside the subquery would mean its own row.
 */

/** The topic's latest point before this one, as JSON. */
const previous = sql<
  string | null
>`(SELECT json_object('slot', p.slot, 'state', p.state, 'height', p.height)
  FROM wave_points p WHERE p.topic_id = wave_points.topic_id AND p.slot < wave_points.slot
  ORDER BY p.slot DESC LIMIT 1)`;

/** The topic's latest point at or before `cut`, as JSON. */
const latestBy = (cut: string) =>
  sql<string | null>`(SELECT json_object('slot', b.slot, 'state', b.state, 'height', b.height)
    FROM wave_points b WHERE b.topic_id = wave_points.topic_id AND b.slot <= ${cut}
    ORDER BY b.slot DESC LIMIT 1)`;

/**
 * The points of `slot`, each with the topic's point before it and its
 * 24-hour base; only the topics in `ids` when given.
 */
async function pointsAt(db: Db, slot: string, ids?: readonly string[]) {
  const parts = ids === undefined ? [undefined] : chunks(ids);
  const out = [];
  for (const part of parts) {
    const rows = await db
      .select({
        topicId: wavePoints.topicId,
        state: wavePoints.state,
        height: wavePoints.height,
        prev: previous,
        base: latestBy(dayBefore(slot)),
      })
      .from(wavePoints)
      .where(
        part === undefined
          ? eq(wavePoints.slot, slot)
          : sql`${wavePoints.slot} = ${slot}
              AND ${wavePoints.topicId} IN (SELECT value FROM json_each(${JSON.stringify(part)}))`,
      )
      .orderBy(asc(wavePoints.topicId));
    for (const r of rows) out.push({ ...r, prev: parse(r.prev), base: parse(r.base) });
  }
  return out;
}

/** The 24-hour change of each topic's point in `slot`; null when it was not up there. */
async function changesAt(db: Db, slot: string, ids: readonly string[]) {
  const out = new Map<string, number | null>();
  for (const r of await pointsAt(db, slot, ids)) {
    out.set(r.topicId, r.state === "up" ? change24h(r.height, baseHeight(r.base)) : null);
  }
  return out;
}

export function changesStep(): Step {
  return {
    name: "changes",
    async run(ctx): Promise<ChangesOutput> {
      const { settings } = await readSettings(ctx.db, ctx.now());
      const line = settings.risingPercent24h;
      const rows = await pointsAt(ctx.db, ctx.slot);

      const wentFlat = rows.filter((r) => r.state === "flat" && r.prev?.state === "up");

      const up = rows
        .filter((r) => r.state === "up")
        .map((r) => ({ ...r, change: change24h(r.height, baseHeight(r.base)) }));
      // Only a wave that reaches the line now needs its previous point's change.
      const candidates = up.filter((r) => crossedRising(r.change, null, line));
      const bySlot = new Map<string, string[]>();
      for (const r of candidates) {
        if (r.prev === null) continue;
        const ids = bySlot.get(r.prev.slot);
        if (ids) ids.push(r.topicId);
        else bySlot.set(r.prev.slot, [r.topicId]);
      }
      const before = new Map<string, number | null>();
      for (const [slot, ids] of bySlot) {
        for (const [id, change] of await changesAt(ctx.db, slot, ids)) before.set(id, change);
      }
      const rising = candidates.filter((r) =>
        crossedRising(r.change, before.get(r.topicId) ?? null, line),
      );

      const events = [
        ...rising.map((r) => ({
          type: "wave_rising",
          topicId: r.topicId,
          detail: JSON.stringify({ from: baseHeight(r.base), to: r.height, percent: r.change }),
        })),
        ...wentFlat.map((r) => ({ type: "went_flat", topicId: r.topicId, detail: null })),
      ];
      const at = slotStart(ctx.slot);
      const writes = chunks(events).map((part) =>
        ctx.db.run(sql`INSERT INTO events (type, topic_id, slot, at, detail)
          SELECT json_extract(value, '$.type'), json_extract(value, '$.topicId'), ${ctx.slot}, ${at},
            json_extract(value, '$.detail')
          FROM json_each(${JSON.stringify(part)}) WHERE true
          ON CONFLICT DO NOTHING`),
      );
      const [first, ...rest] = writes;
      if (first) await ctx.db.batch([first, ...rest]);

      return { rising: rising.map((r) => r.topicId), wentFlat: wentFlat.map((r) => r.topicId) };
    },
  };
}
