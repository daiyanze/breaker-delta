/**
 * The step runner (ADR 0018, #171). One run is a list of steps executed in
 * order for one slot. The same code runs locally and on Cloudflare; there is
 * no Workflows engine underneath.
 *
 * - A slot runs once. A run that is done or failed is never started again.
 * - A run holds a lease (`runs.lease_until`) while it executes and renews it
 *   after each step, so a second tick cannot run the same slot meanwhile.
 * - Each step's result is written to `run_steps`. A run that stopped halfway
 *   (process killed, Worker evicted) resumes after the last finished step
 *   once its lease has expired, without repeating finished steps.
 * - A failing step is retried up to `maxAttempts` times, then the step and
 *   the run are marked failed and later steps do not run.
 *
 * Steps pass ids and counts, never fetched text (invariant 6).
 */
import { type Db, runSteps, runs } from "@bd/db";
import { and, eq, isNull, lt, or } from "drizzle-orm";

export interface StepContext {
  slot: string;
  db: Db;
  now(): number;
  /** Results of the steps that finished before this one, by step name. */
  outputs: ReadonlyMap<string, unknown>;
}

export interface Step {
  name: string;
  /** Must return a JSON-serialisable value (or nothing). */
  run(ctx: StepContext): Promise<unknown>;
}

export interface RunnerOptions {
  maxAttempts: number;
  leaseMs: number;
}

export type RunOutcome =
  | { status: "done"; resumed: boolean }
  | { status: "failed"; resumed: boolean; step: string; error: string }
  /** Another runner holds the lease. */
  | { status: "busy" }
  /** The slot already finished (done or failed) earlier. */
  | { status: "finished"; runStatus: "done" | "failed" };

const MAX_ERROR = 200;

/** Error class and message only, cut short: no stack, no fetched text. */
function describe(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.length > MAX_ERROR ? `${text.slice(0, MAX_ERROR - 1)}…` : text;
}

/** Take the lease if the run is still running and nobody holds it. */
async function claim(db: Db, slot: string, nowMs: number, leaseMs: number): Promise<boolean> {
  const claimed = await db
    .update(runs)
    .set({ leaseUntil: nowMs + leaseMs })
    .where(
      and(
        eq(runs.slot, slot),
        eq(runs.status, "running"),
        or(isNull(runs.leaseUntil), lt(runs.leaseUntil, nowMs)),
      ),
    )
    .returning({ slot: runs.slot });
  return claimed.length === 1;
}

async function finish(db: Db, slot: string, status: "done" | "failed", nowMs: number) {
  await db
    .update(runs)
    .set({ status, finishedAt: nowMs, leaseUntil: null })
    .where(eq(runs.slot, slot));
}

export async function runSlot(
  db: Db,
  now: () => number,
  slot: string,
  steps: readonly Step[],
  options: RunnerOptions,
): Promise<RunOutcome> {
  const started = now();
  const opened = await db
    .insert(runs)
    .values({ slot, status: "running", startedAt: started })
    .onConflictDoNothing({ target: runs.slot })
    .returning({ slot: runs.slot });
  const resumed = opened.length === 0;

  if (resumed) {
    const row = await db
      .select({ status: runs.status })
      .from(runs)
      .where(eq(runs.slot, slot))
      .get();
    if (row && row.status !== "running") return { status: "finished", runStatus: row.status };
  }
  if (!(await claim(db, slot, now(), options.leaseMs))) return { status: "busy" };

  const done = await db
    .select({ step: runSteps.step, output: runSteps.output })
    .from(runSteps)
    .where(and(eq(runSteps.slot, slot), eq(runSteps.status, "done")));
  const outputs = new Map<string, unknown>(
    done.map((d) => [d.step, d.output === null ? null : JSON.parse(d.output)]),
  );

  for (const step of steps) {
    if (outputs.has(step.name)) continue;
    let lastError = "";
    let output: unknown;
    let ok = false;
    let attempts = 0;
    while (!ok && attempts < options.maxAttempts) {
      attempts++;
      try {
        output = await step.run({ slot, db, now, outputs });
        ok = true;
      } catch (err) {
        lastError = describe(err);
      }
    }
    const record = {
      slot,
      step: step.name,
      status: ok ? ("done" as const) : ("failed" as const),
      attempts,
      output: ok ? JSON.stringify(output ?? null) : null,
      error: ok ? null : lastError,
      finishedAt: now(),
    };
    await db
      .insert(runSteps)
      .values(record)
      .onConflictDoUpdate({ target: [runSteps.slot, runSteps.step], set: record });
    if (!ok) {
      await finish(db, slot, "failed", now());
      return { status: "failed", resumed, step: step.name, error: lastError };
    }
    outputs.set(step.name, output ?? null);
    // Renew the lease so a long run is not taken over between steps.
    await db
      .update(runs)
      .set({ leaseUntil: now() + options.leaseMs })
      .where(eq(runs.slot, slot));
  }

  await finish(db, slot, "done", now());
  return { status: "done", resumed };
}
