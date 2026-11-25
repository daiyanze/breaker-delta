/**
 * Model usage records (M2-07, #48). The assign and summarize steps record
 * every HTTP call their driver made, answered or not, as `model_calls` rows:
 * the provider and model, the prompt version, the outcome, whether the chain
 * had fallen back to a later provider, and the token counts the response's
 * `usage` gave. A call a retried step attempt makes again is a new row: it
 * was a real call. Nothing here holds a key, a message or an error text.
 *
 * `usageByDay` totals them per day of the run's slot (UTC, as `slotId`).
 */
import { type Db, type MODEL_TASKS, modelCalls } from "@bd/db";
import type { ModelCall } from "@bd/judge";
import { asc, sql } from "drizzle-orm";
import type { StepContext } from "./runner.ts";

export type ModelTask = (typeof MODEL_TASKS)[number];

/**
 * Write one row per call, in one batch. Each row is its own statement, so a
 * long chain stays under D1's 100 bound values per statement.
 */
export async function recordCalls(
  ctx: StepContext,
  task: ModelTask,
  calls: readonly ModelCall[],
): Promise<void> {
  const at = ctx.now();
  const [head, ...rest] = calls.map((c) =>
    ctx.db.insert(modelCalls).values({
      slot: ctx.slot,
      task,
      provider: c.provider,
      model: c.model,
      promptVersion: c.promptVersion,
      outcome: c.outcome,
      fallback: c.fallback,
      promptTokens: c.usage.promptTokens ?? null,
      completionTokens: c.usage.completionTokens ?? null,
      totalTokens: c.usage.totalTokens ?? null,
      at,
    }),
  );
  if (head) await ctx.db.batch([head, ...rest]);
}

/** One day's calls to one model for one task. */
export interface DailyUsage {
  /** The slot's day, `YYYYMMDD` in UTC. */
  day: string;
  task: ModelTask;
  provider: string;
  model: string;
  calls: number;
  /** Calls that gave no valid answer (`invalid` or `error`). */
  failed: number;
  /** Calls made after an earlier provider of the same chain call failed. */
  fallbacks: number;
  /** Token sums over the calls whose response reported them. */
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Calls whose response reported no `total_tokens`, so the sums leave them out. */
  withoutUsage: number;
}

/**
 * Usage per day, task, provider and model, oldest day first. `fromDay` and
 * `toDay` (`YYYYMMDD`, inclusive) narrow it.
 */
export async function usageByDay(
  db: Db,
  range: { fromDay?: string; toDay?: string } = {},
): Promise<DailyUsage[]> {
  const day = sql<string>`substr(${modelCalls.slot}, 1, 8)`;
  const where = [
    range.fromDay === undefined ? undefined : sql`${day} >= ${range.fromDay}`,
    range.toDay === undefined ? undefined : sql`${day} <= ${range.toDay}`,
  ].filter((w) => w !== undefined);
  const rows = await db
    .select({
      day,
      task: modelCalls.task,
      provider: modelCalls.provider,
      model: modelCalls.model,
      calls: sql<number>`count(*)`,
      failed: sql<number>`sum(${modelCalls.outcome} <> 'ok')`,
      fallbacks: sql<number>`sum(${modelCalls.fallback})`,
      promptTokens: sql<number>`coalesce(sum(${modelCalls.promptTokens}), 0)`,
      completionTokens: sql<number>`coalesce(sum(${modelCalls.completionTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${modelCalls.totalTokens}), 0)`,
      withoutUsage: sql<number>`sum(${modelCalls.totalTokens} IS NULL)`,
    })
    .from(modelCalls)
    .where(where.length === 0 ? undefined : sql.join(where, sql` AND `))
    .groupBy(day, modelCalls.task, modelCalls.provider, modelCalls.model)
    .orderBy(asc(day), asc(modelCalls.task), asc(modelCalls.provider), asc(modelCalls.model));
  return rows.map((r) => ({
    ...r,
    calls: Number(r.calls),
    failed: Number(r.failed),
    fallbacks: Number(r.fallbacks),
    promptTokens: Number(r.promptTokens),
    completionTokens: Number(r.completionTokens),
    totalTokens: Number(r.totalTokens),
    withoutUsage: Number(r.withoutUsage),
  }));
}
