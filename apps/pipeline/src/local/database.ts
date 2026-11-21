/** The Database port on bun:sqlite. Used by local mode (#172) and by tests. */
import type { Database as SQLite, SQLQueryBindings } from "bun:sqlite";
import type { Database, SqlValue } from "@bd/ports";

export function sqliteDatabase(sqlite: SQLite): Database {
  const bind = (params: readonly SqlValue[]) => params as SQLQueryBindings[];
  return {
    async all<T>(sql: string, ...params: SqlValue[]) {
      return sqlite.prepare(sql).all(...bind(params)) as T[];
    },
    async first<T>(sql: string, ...params: SqlValue[]) {
      return (sqlite.prepare(sql).get(...bind(params)) as T | null) ?? null;
    },
    async run(sql: string, ...params: SqlValue[]) {
      return { changes: sqlite.prepare(sql).run(...bind(params)).changes };
    },
    async batch(statements) {
      sqlite.transaction(() => {
        for (const s of statements) sqlite.prepare(s.sql).run(...bind(s.params ?? []));
      })();
    },
  };
}
