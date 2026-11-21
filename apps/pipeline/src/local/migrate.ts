/**
 * Apply `packages/db/migrations` to a local SQLite file. On Cloudflare,
 * `wrangler d1 migrations apply` does the same job for D1. Each file runs
 * once, in name order, inside a transaction; applied names are recorded in
 * `_migrations`.
 */
import type { Database as SQLite } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The repository's migrations directory. */
export const MIGRATIONS_DIR = join(import.meta.dir, "../../../../packages/db/migrations");

export function migrate(sqlite: SQLite, dir: string = MIGRATIONS_DIR): string[] {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const rows = sqlite.query("SELECT name FROM _migrations").all() as { name: string }[];
  const applied = new Set(rows.map((r) => r.name));
  const record = sqlite.query("INSERT INTO _migrations (name, applied_at) VALUES (?1, ?2)");
  const files = readdirSync(dir).filter((n) => n.endsWith(".sql"));
  const ran: string[] = [];
  for (const name of files.sort()) {
    if (applied.has(name)) continue;
    const sql = readFileSync(join(dir, name), "utf8");
    sqlite.transaction(() => {
      sqlite.exec(sql);
      record.run(name, Date.now());
    })();
    ran.push(name);
  }
  return ran;
}
