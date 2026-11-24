/**
 * The select step (M1-17, #33): which waves get a summary in this run. Which
 * waves are due and in what order comes from `@bd/core` (`summaryDue`,
 * `selectForSummary`); this step only reads their state and returns ids.
 * It writes nothing.
 *
 * 1. **Waves.** Topics whose point in this slot (written by compute) is `up`.
 *    A flat wave or a merged topic has no up point, so it is never selected.
 * 2. **Due.** A wave with no published summary is due as `formed`. One with
 *    a published summary is due as `new_echoes` once `rewriteAfterNewEchoes`
 *    of its echoes were first seen in a slot after that summary's slot. An
 *    echo merged in from another topic counts by its own first slot, so one
 *    older than the summary does not count. Only summaries and echoes from
 *    this slot or earlier are read.
 * 3. **Budget.** At most `summariesPerRun` waves, earliest due first, then by
 *    height. The rest are returned as `waiting`. Nothing records them: the
 *    next run finds them due again, since they still have no new summary,
 *    and takes them before any wave that became due later.
 *
 * A discarded attempt (it failed validation) does not end a wave's wait; it
 * moves it to the attempt's slot, so the wave is tried again next run behind
 * the waves due before it.
 *
 * The step reads the slot's start, not the clock, and writes nothing, so a
 * retried or resumed attempt returns the same output. The output holds
 * topic ids and reasons only.
 */
import { type SummaryReason, selectForSummary, slotStart, summaryDue } from "@bd/core";
import { echoes, topics, wavePoints } from "@bd/db";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Step } from "./runner.ts";
import { readSettings } from "./settings.ts";

/** What the step returns; the runner stores it in `run_steps.output`. */
export interface SelectOutput {
  /** The waves to summarise in this run, in order. */
  selected: { topicId: string; reason: SummaryReason }[];
  /** Waves that are due but over this run's budget, in order. */
  waiting: string[];
}

/** Ids per `json_each` parameter, as in compute. */
const CHUNK = 500;

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/*
 * The subqueries name the outer row by table (`wave_points.topic_id`,
 * `echoes.topic_id`), as in changes: drizzle renders a selected column
 * unqualified, which inside a subquery would mean its own row.
 */

/** The topic's latest summary slot with `status`, from `slot` or earlier. */
const latestSummary = (status: "published" | "discarded", slot: string) =>
  sql<string | null>`(SELECT MAX(s.slot) FROM summaries s
    WHERE s.topic_id = wave_points.topic_id AND s.status = ${status} AND s.slot <= ${slot})`;

export function selectStep(): Step {
  return {
    name: "select",
    async run(ctx): Promise<SelectOutput> {
      const { settings } = await readSettings(ctx.db, ctx.now());
      const nowMs = slotStart(ctx.slot);

      const waves = await ctx.db
        .select({
          topicId: wavePoints.topicId,
          height: wavePoints.height,
          formedAt: topics.formedAt,
          published: latestSummary("published", ctx.slot),
          discarded: latestSummary("discarded", ctx.slot),
        })
        .from(wavePoints)
        .leftJoin(topics, eq(topics.id, wavePoints.topicId))
        .where(and(eq(wavePoints.slot, ctx.slot), eq(wavePoints.state, "up")))
        .orderBy(asc(wavePoints.topicId));

      // The first slots of each summarised wave's echoes newer than its latest summary.
      const newEchoes = new Map<string, number[]>();
      const summarised = waves.filter((w) => w.published !== null).map((w) => w.topicId);
      for (const part of chunks(summarised)) {
        const rows = await ctx.db
          .select({ topicId: echoes.topicId, slot: echoes.firstSlot })
          .from(echoes)
          .where(
            sql`${echoes.topicId} IN (SELECT value FROM json_each(${JSON.stringify(part)}))
              AND ${echoes.firstSlot} <= ${ctx.slot}
              AND ${echoes.firstSlot} > (SELECT MAX(s.slot) FROM summaries s
                WHERE s.topic_id = echoes.topic_id AND s.status = 'published'
                  AND s.slot <= ${ctx.slot})`,
          );
        for (const r of rows) {
          if (r.topicId === null) continue;
          const list = newEchoes.get(r.topicId);
          if (list) list.push(slotStart(r.slot));
          else newEchoes.set(r.topicId, [slotStart(r.slot)]);
        }
      }

      const candidates = waves.flatMap((w) => {
        const publishedAt = w.published === null ? null : slotStart(w.published);
        const failedAt =
          w.discarded !== null && (w.published === null || w.discarded > w.published)
            ? slotStart(w.discarded)
            : null;
        const due = summaryDue(
          {
            // Compute sets formed_at with the first up point; the slot is a fallback.
            formedAt: w.formedAt ?? nowMs,
            publishedAt,
            newEchoesAt: newEchoes.get(w.topicId) ?? [],
            failedAt,
          },
          settings.rewriteAfterNewEchoes,
        );
        return due === null ? [] : [{ id: w.topicId, height: w.height, ...due }];
      });

      const { selected, waiting } = selectForSummary(candidates, settings.summariesPerRun);
      return {
        selected: selected.map((c) => ({ topicId: c.id, reason: c.reason })),
        waiting: waiting.map((c) => c.id),
      };
    },
  };
}
