/** The Database port on Cloudflare D1. */
import type { Database, SqlValue } from "@bd/ports";

export function d1Database(d1: D1Database): Database {
  const statement = (sql: string, params: readonly SqlValue[]) => d1.prepare(sql).bind(...params);
  return {
    async all<T>(sql: string, ...params: SqlValue[]) {
      return (await statement(sql, params).all<T>()).results;
    },
    async first<T>(sql: string, ...params: SqlValue[]) {
      return (await statement(sql, params).first<T>()) ?? null;
    },
    async run(sql: string, ...params: SqlValue[]) {
      const result = await statement(sql, params).run();
      return { changes: result.meta.changes ?? 0 };
    },
    async batch(statements) {
      // D1 runs a batch as one transaction.
      await d1.batch(statements.map((s) => statement(s.sql, s.params ?? [])));
    },
  };
}
