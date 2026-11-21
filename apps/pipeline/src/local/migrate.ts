/**
 * Apply the migrations to a local SQLite file. On Cloudflare,
 * `wrangler d1 migrations apply` does the same job for D1. Each migration
 * runs once, in name order, inside a transaction; applied names are
 * recorded in `_migrations`.
 */
import type { Database as SQLite } from "bun:sqlite";
import { MIGRATIONS, type Migration } from "./migrations.ts";

export function migrate(sqlite: SQLite, migrations: readonly Migration[] = MIGRATIONS): string[] {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const rows = sqlite.query("SELECT name FROM _migrations").all() as { name: string }[];
  const applied = new Set(rows.map((r) => r.name));
  const record = sqlite.query("INSERT INTO _migrations (name, applied_at) VALUES (?1, ?2)");
  const ran: string[] = [];
  const ordered = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
  for (const { name, sql } of ordered) {
    if (applied.has(name)) continue;
    sqlite.transaction(() => {
      sqlite.exec(sql);
      record.run(name, Date.now());
    })();
    ran.push(name);
  }
  return ran;
}
