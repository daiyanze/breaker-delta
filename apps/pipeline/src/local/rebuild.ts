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
  const image = stored.serialize();
  // Local mode keeps content.db in WAL mode (server.ts). An in-memory copy
  // cannot use WAL, and the header's file-format bytes (offsets 18 and 19,
  // 2 = WAL) would fail its first write with SQLITE_CANTOPEN. 1 = rollback
  // journal, which is what a fresh in-memory database uses.
  image[18] = 1;
  image[19] = 1;
  const scratch = SQLite.deserialize(image);
  try {
    return await rebuild(drizzleOver(sqliteDatabase(stored)), drizzleOver(sqliteDatabase(scratch)));
  } finally {
    scratch.close();
    stored.close();
  }
}
