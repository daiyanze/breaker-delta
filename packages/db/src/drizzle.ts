/**
 * Drizzle on top of the Database port (ADR 0018). The app core writes typed
 * queries against the schema; underneath, every query goes through the same
 * small port that bun:sqlite and D1 both implement, so there is one code
 * path and one atomic-write rule for both runtimes.
 *
 * Drizzle's native drivers differ exactly where it matters: D1 has no
 * interactive transactions and bun-sqlite has no `batch`. Going through the
 * port, an atomic write is always `db.batch([...])` of write statements.
 */
import type { Database, SqlValue } from "@bd/ports";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema.ts";

export type Db = SqliteRemoteDatabase<typeof schema>;

type Method = "run" | "all" | "values" | "get";

export function drizzleOver(db: Database): Db {
  async function one(sql: string, params: unknown[], method: Method) {
    const values = params as SqlValue[];
    if (method === "run") {
      await db.run(sql, ...values);
      return { rows: [] };
    }
    const rows = await db.values(sql, ...values);
    // `get` expects the single row itself, or undefined when there is none.
    return (method === "get" ? { rows: rows[0] } : { rows }) as { rows: unknown[] };
  }

  async function batch(queries: { sql: string; params: unknown[]; method: Method }[]) {
    const reads = queries.filter((q) => q.method !== "run");
    if (reads.length > 0) {
      throw new Error("batch takes write statements only; read before or after it");
    }
    await db.batch(queries.map((q) => ({ sql: q.sql, params: q.params as SqlValue[] })));
    return queries.map(() => ({ rows: [] as unknown[] }));
  }

  return drizzle(one, batch, { schema });
}
