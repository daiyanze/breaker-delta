/** The `runs` table, through drizzle over the Database port. */
import { type Db, runs } from "@bd/db";
import { desc, eq } from "drizzle-orm";

/** The JSON shape `/health` has always returned, so columns keep their SQL names. */
const columns = {
  slot: runs.slot,
  status: runs.status,
  started_at: runs.startedAt,
  finished_at: runs.finishedAt,
};

export interface RunRow {
  slot: string;
  status: "running" | "done" | "failed";
  started_at: number;
  finished_at: number | null;
}

export async function findRun(db: Db, slot: string): Promise<RunRow | null> {
  return (await db.select(columns).from(runs).where(eq(runs.slot, slot)).get()) ?? null;
}

export async function lastRun(db: Db): Promise<RunRow | null> {
  return (await db.select(columns).from(runs).orderBy(desc(runs.startedAt)).limit(1).get()) ?? null;
}

/** Idempotent: opening a slot that is already open changes nothing. */
export async function openRun(db: Db, slot: string, nowMs: number): Promise<void> {
  const row = { slot, status: "running" as const, startedAt: nowMs };
  await db.insert(runs).values(row).onConflictDoNothing({ target: runs.slot });
}

export async function closeRun(db: Db, slot: string, nowMs: number): Promise<void> {
  await db.update(runs).set({ status: "done", finishedAt: nowMs }).where(eq(runs.slot, slot));
}
