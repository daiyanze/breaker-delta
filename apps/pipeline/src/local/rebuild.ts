/**
 * Rebuild on a local SQLite file (#37). The file is opened read-only and
 * copied into memory; the replay writes to the copy only, so the content
 * database is never written (`rebuild` in `../core/rebuild.ts`).
 */
import { Database as SQLite } from "bun:sqlite";
import { drizzleOver } from "@bd/db";
import { type RebuildResult, rebuild } from "../core/rebuild.ts";
import { sqliteDatabase } from "./database.ts";

export async function rebuildFile(path: string): Promise<RebuildResult> {
  const stored = new SQLite(path, { readonly: true });
  const scratch = SQLite.deserialize(stored.serialize());
  try {
    return await rebuild(drizzleOver(sqliteDatabase(stored)), drizzleOver(sqliteDatabase(scratch)));
  } finally {
    scratch.close();
    stored.close();
  }
}
