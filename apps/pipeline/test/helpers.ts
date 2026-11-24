/** Test helpers: an in-memory SQLite database with every migration applied. */
import { Database as SQLite } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Blobs } from "@bd/ports";
import { sqliteDatabase } from "../src/local/database.ts";

const MIGRATIONS = join(import.meta.dir, "../../../packages/db/migrations");

export function migratedDatabase() {
  const sqlite = new SQLite(":memory:");
  const files = readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql"));
  for (const name of files.sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS, name), "utf8"));
  }
  return { sqlite, db: sqliteDatabase(sqlite) };
}

/** 14:07 JST on Nov 19, inside slot 20261119T0500. */
export const NOW = Date.UTC(2026, 10, 19, 5, 7);
export const SLOT = "20261119T0500";

/** The Blobs port in memory; `store` holds each key's text. */
export function memoryBlobs() {
  const store = new Map<string, string>();
  const blobs: Blobs = {
    async get(key) {
      const v = store.get(key);
      return v === undefined ? null : new TextEncoder().encode(v);
    },
    async put(key, body) {
      store.set(key, typeof body === "string" ? body : new TextDecoder().decode(body));
    },
    async delete(key) {
      store.delete(key);
    },
    async list(prefix) {
      return [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
  return { blobs, store };
}

/** Cloudflare D1's limit on bound values in one statement. */
export const D1_MAX_PARAMS = 100;

/**
 * `db` that throws, as D1 does, on a statement binding more than
 * `D1_MAX_PARAMS` values, so a bun:sqlite test catches what only D1 refuses.
 */
export function d1Limited(
  db: ReturnType<typeof sqliteDatabase>,
): ReturnType<typeof sqliteDatabase> {
  const check = (params: readonly unknown[] | undefined) => {
    if ((params?.length ?? 0) > D1_MAX_PARAMS) throw new Error("too many SQL variables");
  };
  return {
    ...db,
    all: (sql, ...params) => {
      check(params);
      return db.all(sql, ...params);
    },
    values: (sql, ...params) => {
      check(params);
      return db.values(sql, ...params);
    },
    first: (sql, ...params) => {
      check(params);
      return db.first(sql, ...params);
    },
    run: (sql, ...params) => {
      check(params);
      return db.run(sql, ...params);
    },
    batch: (statements) => {
      for (const st of statements) check(st.params);
      return db.batch(statements);
    },
  };
}
