/** The `runs` table. All SQL for runs lives here, behind the Database port. */
import type { Database } from "@bd/ports";

export interface RunRow {
  slot: string;
  status: "running" | "done" | "failed";
  started_at: number;
  finished_at: number | null;
}

export function findRun(db: Database, slot: string): Promise<RunRow | null> {
  return db.first<RunRow>(
    "SELECT slot, status, started_at, finished_at FROM runs WHERE slot = ?1",
    slot,
  );
}

export function lastRun(db: Database): Promise<RunRow | null> {
  return db.first<RunRow>(
    "SELECT slot, status, started_at, finished_at FROM runs ORDER BY started_at DESC LIMIT 1",
  );
}

/** Idempotent: opening a slot that is already open changes nothing. */
export async function openRun(db: Database, slot: string, nowMs: number): Promise<void> {
  await db.run(
    "INSERT OR IGNORE INTO runs (slot, status, started_at) VALUES (?1, 'running', ?2)",
    slot,
    nowMs,
  );
}

export async function closeRun(db: Database, slot: string, nowMs: number): Promise<void> {
  await db.run("UPDATE runs SET status = 'done', finished_at = ?2 WHERE slot = ?1", slot, nowMs);
}
