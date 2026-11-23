/**
 * The drizzle schema in `@bd/db` and the SQL migrations describe the same
 * database. Queries are typed from the schema and run against tables the
 * migrations made, so a column, a NOT NULL, a default, an index or a CHECK
 * that is in one and not the other is a bug in waiting.
 */
import { Database as SQLite } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import * as schema from "@bd/db";
import type { SQL } from "drizzle-orm";
import { getTableConfig, SQLiteSyncDialect, SQLiteTable } from "drizzle-orm/sqlite-core";
import { migrate } from "../src/local/migrate.ts";

const tables = Object.values(schema as Record<string, unknown>).filter(
  (v): v is SQLiteTable => v instanceof SQLiteTable,
);

function migrated(): SQLite {
  const sqlite = new SQLite(":memory:");
  migrate(sqlite);
  return sqlite;
}

interface Column {
  name: string;
  notnull: number;
  pk: number;
  dflt_value: string | null;
}

interface IndexRow {
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

/** A drizzle default as SQLite prints it in `table_info`. */
function sqlDefault(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `'${value}'`;
  throw new Error(`unexpected default ${String(value)}`);
}

function indexColumns(sqlite: SQLite, index: string): string[] {
  const rows = sqlite.query(`PRAGMA index_info("${index}")`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

/** The SQL text of a partial index's WHERE, as SQLite stored it; null when not partial. */
function indexWhere(sqlite: SQLite, index: string): string | null {
  const row = sqlite.query("SELECT sql FROM sqlite_master WHERE name = ?1").get(index) as {
    sql: string;
  };
  return / WHERE (.*)$/s.exec(row.sql)?.[1] ?? null;
}

/** Named CHECKs in a table's CREATE statement, one per line as the migrations write them. */
function tableChecks(sqlite: SQLite, table: string) {
  const row = sqlite.query("SELECT sql FROM sqlite_master WHERE name = ?1").get(table) as {
    sql: string;
  };
  const named = [...row.sql.matchAll(/CONSTRAINT (\w+) CHECK \((.*)\),?$/gm)].map((m) => ({
    name: m[1] as string,
    value: m[2] as string,
  }));
  // An unnamed or column-level CHECK would escape the comparison: refuse it.
  const all = row.sql.match(/\bCHECK\b/gi)?.length ?? 0;
  if (all !== named.length) {
    throw new Error(`${table}: write each CHECK as its own line, CONSTRAINT <name> CHECK (...)`);
  }
  return named;
}

const dialect = new SQLiteSyncDialect();
const render = (value: SQL) => dialect.sqlToQuery(value).sql;

type TableConfig = ReturnType<typeof getTableConfig>;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** One table as the database has it and as the schema declares it, in the same shape. */
function sides(sqlite: SQLite, config: TableConfig) {
  const cols = sqlite.query(`PRAGMA table_info("${config.name}")`).all() as Column[];
  const list = sqlite.query(`PRAGMA index_list("${config.name}")`).all() as IndexRow[];
  const db = {
    columns: cols
      .map((c) => ({ name: c.name, notNull: c.notnull === 1 || c.pk > 0, default: c.dflt_value }))
      .sort(byName),
    primaryKey: cols
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name),
    indexes: list
      .filter((i) => i.origin === "c")
      .map((i) => ({
        name: i.name,
        unique: i.unique === 1,
        where: i.partial === 1 ? indexWhere(sqlite, i.name) : null,
        columns: indexColumns(sqlite, i.name),
      }))
      .sort(byName),
    // UNIQUE written on a column: SQLite names the index itself.
    uniqueColumns: list
      .filter((i) => i.origin === "u")
      .map((i) => indexColumns(sqlite, i.name).join(","))
      .sort(),
    checks: tableChecks(sqlite, config.name).sort(byName),
  };
  const declared = {
    columns: config.columns
      .map((c) => ({
        name: c.name,
        notNull: c.notNull || c.primary,
        default: sqlDefault(c.default),
      }))
      .sort(byName),
    primaryKey: [
      ...config.columns.filter((c) => c.primary).map((c) => c.name),
      ...config.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)),
    ],
    indexes: config.indexes
      .map((i) => ({
        name: i.config.name,
        unique: i.config.unique,
        where: i.config.where ? render(i.config.where) : null,
        columns: i.config.columns.map((c) => (c as { name: string }).name),
      }))
      .sort(byName),
    uniqueColumns: config.columns
      .filter((c) => c.isUnique)
      .map((c) => c.name)
      .sort(),
    checks: config.checks.map((c) => ({ name: c.name, value: render(c.value) })).sort(byName),
  };
  return { db, declared };
}

describe("schema and migrations", () => {
  test("every migrated table is in the schema, and the other way round", () => {
    const sqlite = migrated();
    const inDb = sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('_migrations', 'sqlite_sequence')",
      )
      .all() as { name: string }[];
    const inSchema = tables.map((t) => getTableConfig(t).name);
    expect(inDb.map((r) => r.name).sort()).toEqual(inSchema.sort());
  });

  for (const table of tables) {
    const config = getTableConfig(table);
    test(`${config.name}: same columns, NOT NULLs, defaults, keys and indexes`, () => {
      const { db, declared } = sides(migrated(), config);
      expect(db).toEqual(declared);
    });
  }

  test("the comparison sees each kind of drift", () => {
    const config = getTableConfig(schema.echoes);
    const good = sides(migrated(), config).declared;
    const drifted = (sql: string) => {
      const sqlite = new SQLite(":memory:");
      sqlite.exec(sql);
      return sides(sqlite, config).db;
    };
    const columns = `id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, group_id TEXT NOT NULL,
      title TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'und', excerpt TEXT, published_at INTEGER,
      first_seen_at INTEGER NOT NULL, first_slot TEXT NOT NULL, topic_id TEXT`;
    const indexes = `CREATE INDEX echoes_topic ON echoes (topic_id);
      CREATE INDEX echoes_group ON echoes (group_id, first_seen_at);
      CREATE INDEX echoes_seen ON echoes (first_seen_at);`;
    // The planted copy matches, so each change below is what makes it differ.
    expect(drifted(`CREATE TABLE echoes (${columns}); ${indexes}`)).toEqual(good);
    const cases = [
      columns.replace("lang TEXT NOT NULL DEFAULT 'und'", "lang TEXT NOT NULL"),
      columns.replace("first_slot TEXT NOT NULL", "first_slot TEXT"),
      columns.replace(" excerpt TEXT,", ""),
      columns.replace("url TEXT NOT NULL UNIQUE", "url TEXT NOT NULL"),
    ];
    for (const c of cases)
      expect(drifted(`CREATE TABLE echoes (${c}); ${indexes}`)).not.toEqual(good);
    const noIndex = indexes.replace("CREATE INDEX echoes_seen ON echoes (first_seen_at);", "");
    expect(drifted(`CREATE TABLE echoes (${columns}); ${noIndex}`)).not.toEqual(good);
    const partial = indexes.replace("(first_seen_at);", "(first_seen_at) WHERE topic_id IS NULL;");
    expect(drifted(`CREATE TABLE echoes (${columns}); ${partial}`)).not.toEqual(good);
    const checked = `${columns},\n  CONSTRAINT echoes_lang CHECK (lang <> '')`;
    expect(drifted(`CREATE TABLE echoes (${checked}); ${indexes}`)).not.toEqual(good);
    const unnamed = columns.replace(
      "title TEXT NOT NULL",
      "title TEXT NOT NULL CHECK (title <> '')",
    );
    expect(() => drifted(`CREATE TABLE echoes (${unnamed}); ${indexes}`)).toThrow(/CONSTRAINT/);
  });

  test("the comparison sees a changed WHERE and a changed CHECK", () => {
    const config = getTableConfig(schema.events);
    const good = sides(migrated(), config).declared;
    const sqlite = new SQLite(":memory:");
    // The real table, but one partial index and the type CHECK changed.
    const real = migrated()
      .query("SELECT sql FROM sqlite_master WHERE tbl_name = 'events' AND sql IS NOT NULL")
      .all() as { sql: string }[];
    for (const { sql } of real) {
      sqlite.exec(
        sql
          .replace("WHERE type = 'summary_updated'", "WHERE type = 'corrected'")
          .replace("'went_flat'))", "'gone'))"),
      );
    }
    const db = sides(sqlite, config).db;
    expect(db.indexes).not.toEqual(good.indexes);
    expect(db.checks).not.toEqual(good.checks);
  });
});

describe("content tables", () => {
  test("a topic forms once", () => {
    const sqlite = migrated();
    const add = sqlite.query(
      "INSERT INTO events (type, topic_id, slot, at) VALUES (?1, 't1', ?2, 0)",
    );
    add.run("wave_formed", "20261119T0500");
    expect(() => add.run("wave_formed", "20261119T0600")).toThrow(/UNIQUE/);
  });

  test("a resumed run cannot write a detected event twice, but desk events may repeat", () => {
    const sqlite = migrated();
    const add = sqlite.query(
      "INSERT INTO events (type, topic_id, slot, at) VALUES (?1, 't1', '20261119T0500', 0)",
    );
    add.run("wave_rising");
    expect(() => add.run("wave_rising")).toThrow(/UNIQUE/);
    add.run("went_flat");
    expect(() => add.run("went_flat")).toThrow(/UNIQUE/);
    add.run("corrected");
    add.run("corrected");
    add.run("verdict");
    add.run("verdict");
  });

  test("a summary version is published once per topic; discarded attempts have none", () => {
    const sqlite = migrated();
    const add = sqlite.query(
      `INSERT INTO summaries (id, topic_id, version, status, reason, writer, slot, created_at)
       VALUES (?1, 't1', ?2, ?3, 'formed', 'p', '20261119T0500', 0)`,
    );
    add.run("s1", 1, "published");
    expect(() => add.run("s2", 1, "published")).toThrow(/UNIQUE/);
    add.run("s3", null, "discarded");
    add.run("s4", null, "discarded");
    add.run("s5", 2, "published");
  });

  test("a summary gets one summary_updated event", () => {
    const sqlite = migrated();
    const add = sqlite.query(
      "INSERT INTO events (type, topic_id, slot, at, summary_id) VALUES ('summary_updated', 't1', ?1, 0, ?2)",
    );
    add.run("20261119T0500", "s1");
    expect(() => add.run("20261119T0600", "s1")).toThrow(/UNIQUE/);
    add.run("20261119T0600", "s2");
  });

  test("a published summary has a version and a discarded one has none", () => {
    const sqlite = migrated();
    const add = sqlite.query(
      `INSERT INTO summaries (id, topic_id, version, status, reason, writer, slot, created_at)
       VALUES (?1, 't1', ?2, ?3, 'formed', 'p', '20261119T0500', 0)`,
    );
    expect(() => add.run("s1", null, "published")).toThrow(/CHECK/);
    expect(() => add.run("s2", 1, "discarded")).toThrow(/CHECK/);
    expect(() => add.run("s3", 1, "draft")).toThrow(/CHECK/);
  });

  test("enum columns refuse values no reader expects", () => {
    const sqlite = migrated();
    const bad = [
      "INSERT INTO topics (id, slug, name, state, created_at) VALUES ('t', 's', 'n', 'wave', 0)",
      "INSERT INTO events (type, topic_id, slot, at) VALUES ('wave_fell', 't', 's', 0)",
      `INSERT INTO verdicts (id, prediction_id, outcome, status, lang, reason, decided_at)
       VALUES ('v', 'p', 'win', 'proposed', 'en', 'r', 0)`,
      "INSERT INTO corrections (id, summary_id, kind, editor, at) VALUES ('c', 's', 'edit', 'e', 0)",
    ];
    for (const q of bad) expect(() => sqlite.run(q)).toThrow(/CHECK/);
  });

  test("one prediction per topic", () => {
    const sqlite = migrated();
    const add = sqlite.query(
      `INSERT INTO predictions (id, topic_id, summary_id, lang, criterion, hash, registered_at, due_at)
       VALUES (?1, 't1', 's1', 'en', 'c', 'h', 0, 1)`,
    );
    add.run("p1");
    expect(() => add.run("p2")).toThrow(/UNIQUE/);
  });

  test("an echo URL is stored once", () => {
    const sqlite = migrated();
    const add = sqlite.query(
      `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot)
       VALUES (?1, 'https://example.com/a', 'hn', 'A', 0, '20261119T0500')`,
    );
    add.run("e1");
    expect(() => add.run("e2")).toThrow(/UNIQUE/);
    const row = sqlite.query("SELECT lang, topic_id FROM echoes").get();
    expect(row).toEqual({ lang: "und", topic_id: null });
  });
});
