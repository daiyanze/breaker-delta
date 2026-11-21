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

export async function lastRun(db: Db): Promise<RunRow | null> {
  return (await db.select(columns).from(runs).orderBy(desc(runs.startedAt)).limit(1).get()) ?? null;
}
