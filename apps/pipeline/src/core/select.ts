/**
 * The select step (M1-17, #33): which waves get a summary in this run. Which
 * waves are due and in what order comes from `@bd/core` (`summaryDue`,
 * `selectForSummary`); this step only reads their state and returns ids.
 * It writes no content: it only reads, except that `readSettings` stores the
 * default settings on a database that has none yet, as in every step.
 *
 * 1. **Waves.** Topics not merged away whose point in this slot (written by
 *    compute) is `up`. A flat wave has no up point, so it is not selected.
 * 2. **Due.** A wave with no published summary is due as `formed`. One with
 *    a published summary is due as `new_echoes` once `rewriteAfterNewEchoes`
 *    of its echoes were first seen in a slot after that summary's slot. An
 *    echo merged in from another topic counts by its own first slot, so one
 *    older than the summary does not count. Only summaries and echoes from
 *    this slot or earlier are read.
 * 3. **Order and budget.** At most `summariesPerRun` waves. Waves the
 *    previous run left waiting go first, in that run's order; then the rest
 *    by height. The rest are returned as `waiting`, and the runner keeps
 *    this output in `run_steps`, which is where the next run reads them.
 *    "Previous run" is the latest earlier slot whose select step finished.
 *
 * The order does not come from when each wave became due: that would need
 * the slot each echo joined its topic (assign places echoes an earlier run
 * could not, and merges move them), which is not recorded. A wave whose
 * attempt was discarded was selected, not left waiting, so it is tried again
 * next run by height, behind the waves it left waiting.
 *
 * The step reads the slot's start and earlier slots' rows, not the clock, so
 * a retried or resumed attempt returns the same output. The output holds
 * topic ids and reasons only.
 */
import { type SummaryReason, selectForSummary, summaryDue } from "@bd/core";
import { type Db, echoes, runSteps, topics, wavePoints } from "@bd/db";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
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

/** The `waiting` list of the latest select step that finished before `slot`. */
async function waitedBefore(db: Db, slot: string): Promise<string[]> {
  const row = await db
    .select({ output: runSteps.output })
    .from(runSteps)
    .where(and(eq(runSteps.step, "select"), eq(runSteps.status, "done"), lt(runSteps.slot, slot)))
    .orderBy(desc(runSteps.slot))
    .limit(1)
    .get();
  const waiting = row?.output ? (JSON.parse(row.output) as Partial<SelectOutput>).waiting : [];
  return Array.isArray(waiting) ? waiting.filter((id) => typeof id === "string") : [];
}

export function selectStep(): Step {
  return {
    name: "select",
    async run(ctx): Promise<SelectOutput> {
      const { settings } = await readSettings(ctx.db, ctx.now());

      const waves = await ctx.db
        .select({
          topicId: wavePoints.topicId,
          height: wavePoints.height,
          published: sql<string | null>`(SELECT MAX(s.slot) FROM summaries s
            WHERE s.topic_id = wave_points.topic_id AND s.status = 'published'
              AND s.slot <= ${ctx.slot})`,
        })
        .from(wavePoints)
        .innerJoin(topics, eq(topics.id, wavePoints.topicId))
        .where(
          and(eq(wavePoints.slot, ctx.slot), eq(wavePoints.state, "up"), isNull(topics.mergedInto)),
        )
        .orderBy(asc(wavePoints.topicId));

      // How many of each summarised wave's echoes are newer than its latest summary.
      const newEchoes = new Map<string, number>();
      const summarised = waves.filter((w) => w.published !== null).map((w) => w.topicId);
      for (const part of chunks(summarised)) {
        const rows = await ctx.db
          .select({ topicId: echoes.topicId, n: sql<number>`COUNT(*)` })
          .from(echoes)
          .where(
            sql`${echoes.topicId} IN (SELECT value FROM json_each(${JSON.stringify(part)}))
              AND ${echoes.firstSlot} <= ${ctx.slot}
              AND ${echoes.firstSlot} > (SELECT MAX(s.slot) FROM summaries s
                WHERE s.topic_id = echoes.topic_id AND s.status = 'published'
                  AND s.slot <= ${ctx.slot})`,
          )
          .groupBy(echoes.topicId);
        for (const r of rows) if (r.topicId !== null) newEchoes.set(r.topicId, r.n);
      }

      const candidates = waves.flatMap((w) => {
        const reason = summaryDue(
          { published: w.published !== null, newEchoes: newEchoes.get(w.topicId) ?? 0 },
          settings.rewriteAfterNewEchoes,
        );
        return reason === null ? [] : [{ id: w.topicId, height: w.height, reason }];
      });

      const { selected, waiting } = selectForSummary(
        candidates,
        settings.summariesPerRun,
        await waitedBefore(ctx.db, ctx.slot),
      );
      return {
        selected: selected.map((c) => ({ topicId: c.id, reason: c.reason })),
        waiting: waiting.map((c) => c.id),
      };
    },
  };
}
