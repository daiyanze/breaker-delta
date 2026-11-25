/**
 * The run report (M2-12, #53): aggregate metrics over the last
 * `reportWindowDays` days of runs, for the owner. `/__report` serves it,
 * behind `REPORT_TOKEN` (`app.ts`).
 *
 * The window is whole UTC days of the run's slot, as `usageByDay` counts
 * them: the day `nowMs` falls in and the `days - 1` days before it.
 *
 * Only counts, durations, token sums, step names, provider and model names
 * and days are read. No column that can hold fetched text, a URL, a model's
 * answer, an error message or a subscriber is selected (`run_steps.output`
 * and `run_steps.error` included), so none can reach the report
 * (invariant 6, ADR 0010).
 */
import { type Db, runSteps, runs } from "@bd/db";
import { asc, sql } from "drizzle-orm";
import { type DailyUsage, usageByDay } from "./usage.ts";

const DAY_MS = 86_400_000;

export interface RunReport {
  window: {
    days: number;
    /** First and last day covered, `YYYYMMDD` in UTC, inclusive. */
    fromDay: string;
    toDay: string;
  };
  runs: {
    total: number;
    done: number;
    failed: number;
    running: number;
    /** Over the runs that finished (`done` or `failed`). Null when none did. */
    averageDurationMs: number | null;
    maxDurationMs: number | null;
  };
  /** Runs per day that had any, oldest first. */
  days: { day: string; runs: number; done: number; failed: number }[];
  /** Per step name: recorded results and attempts. */
  steps: { step: string; done: number; failed: number; attempts: number }[];
  /** Model calls per day, task, provider and model (`usageByDay`). */
  models: DailyUsage[];
}

/** `YYYYMMDD` of the UTC day `ms` falls in. */
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");
}

export async function runReport(db: Db, nowMs: number, days: number): Promise<RunReport> {
  const fromDay = utcDay(nowMs - (days - 1) * DAY_MS);
  const toDay = utcDay(nowMs);

  const runDay = sql<string>`substr(${runs.slot}, 1, 8)`;
  const inWindow = sql`${runDay} >= ${fromDay} AND ${runDay} <= ${toDay}`;
  const duration = sql`CASE WHEN ${runs.finishedAt} IS NOT NULL THEN ${runs.finishedAt} - ${runs.startedAt} END`;
  const totals = await db
    .select({
      total: sql<number>`count(*)`,
      done: sql<number>`coalesce(sum(${runs.status} = 'done'), 0)`,
      failed: sql<number>`coalesce(sum(${runs.status} = 'failed'), 0)`,
      running: sql<number>`coalesce(sum(${runs.status} = 'running'), 0)`,
      averageDurationMs: sql<number | null>`avg(${duration})`,
      maxDurationMs: sql<number | null>`max(${duration})`,
    })
    .from(runs)
    .where(inWindow)
    .get();

  const perDay = await db
    .select({
      day: runDay,
      runs: sql<number>`count(*)`,
      done: sql<number>`sum(${runs.status} = 'done')`,
      failed: sql<number>`sum(${runs.status} = 'failed')`,
    })
    .from(runs)
    .where(inWindow)
    .groupBy(runDay)
    .orderBy(asc(runDay));

  const stepDay = sql<string>`substr(${runSteps.slot}, 1, 8)`;
  const steps = await db
    .select({
      step: runSteps.step,
      done: sql<number>`sum(${runSteps.status} = 'done')`,
      failed: sql<number>`sum(${runSteps.status} = 'failed')`,
      attempts: sql<number>`sum(${runSteps.attempts})`,
    })
    .from(runSteps)
    .where(sql`${stepDay} >= ${fromDay} AND ${stepDay} <= ${toDay}`)
    .groupBy(runSteps.step)
    .orderBy(asc(runSteps.step));

  const orNull = (v: number | null | undefined) =>
    v === null || v === undefined ? null : Math.round(Number(v));
  return {
    window: { days, fromDay, toDay },
    runs: {
      total: Number(totals?.total ?? 0),
      done: Number(totals?.done ?? 0),
      failed: Number(totals?.failed ?? 0),
      running: Number(totals?.running ?? 0),
      averageDurationMs: orNull(totals?.averageDurationMs),
      maxDurationMs: orNull(totals?.maxDurationMs),
    },
    days: perDay.map((d) => ({
      day: d.day,
      runs: Number(d.runs),
      done: Number(d.done),
      failed: Number(d.failed),
    })),
    steps: steps.map((s) => ({
      step: s.step,
      done: Number(s.done),
      failed: Number(s.failed),
      attempts: Number(s.attempts),
    })),
    models: await usageByDay(db, { fromDay, toDay }),
  };
}
