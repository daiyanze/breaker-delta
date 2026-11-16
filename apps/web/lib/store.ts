// Storage for the web app (P2b). One interface, three backends:
//
// - FileStore: the data directory itself (editions/*.json +
//   state/seen-topics.json + config.yaml) — the P2a behaviour, kept
//   for local development and small self-hosts.
// - SqliteStore: a single SQLite file (node:sqlite), written by
//   importDataDir(). Truth stays edition-granular (the unit scans
//   and the push API write); topics/appearances are stored as
//   derived rows computed by core's buildTopics at import time, so
//   a restart never repays buildTopics' ledger matching — under the
//   file model that cost is paid per process, and it is the
//   quadratic term the perf study found (18.5s of a 35s year-scale
//   build; one new edition against the ledger is ~29ms).
// - D1Store (store-d1.ts): the same schema over a Cloudflare D1
//   binding, for the Workers target.
//
// The schema is deliberately boring: raw JSON payloads for fidelity
// (i18n / plugins namespaces ride along untouched), plus the few
// indexed columns queries actually need.

import * as fs from "node:fs";
import * as path from "node:path";

import {
  buildTopics,
  catRulesFromConfig,
  heatOf,
  type Edition,
  type StoreTopic,
  type Topic,
} from "@breaker-delta/core";
import { parseYaml } from "@breaker-delta/fetchers";

export const SCHEMA_VERSION = "1";

export const DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS editions (
  idx INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  slot TEXT,
  published_at TEXT,
  raw TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
  name TEXT PRIMARY KEY,
  raw TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topics (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  ord INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS appearances (
  topic_key TEXT NOT NULL,
  edition_idx INTEGER NOT NULL,
  app_ord INTEGER NOT NULL,
  heat INTEGER NOT NULL,
  raw TEXT NOT NULL,
  PRIMARY KEY (topic_key, app_ord)
);
CREATE INDEX IF NOT EXISTS appearances_by_edition ON appearances (edition_idx);
`;

export interface StoreData {
  editions: Edition[];
  ledger: StoreTopic[];
  config: Record<string, unknown>;
  /** Precomputed topics (DB backends); null = caller runs buildTopics. */
  topics: Topic[] | null;
}

export interface SiteStore {
  load(): Promise<StoreData>;
}

/* ---------------- file backend ---------------- */

const SLOT_ORDER: Record<string, number> = { pilot: 0, morning: 1, evening: 2 };

export function loadEditionsFromDir(dir: string): Edition[] {
  const edDir = path.join(dir, "editions");
  let names: string[] = [];
  try {
    names = fs.readdirSync(edDir).filter((n) => n.endsWith(".json"));
  } catch {
    names = [];
  }
  const keyed = names.map((n) => {
    const m = /(\d{4}-\d{2}-\d{2})-(\w+)/.exec(n);
    if (!m) throw new Error(`edition filename does not parse: ${n}`);
    return { n, date: m[1], order: SLOT_ORDER[m[2]] ?? 9 };
  });
  keyed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
  const editions: Edition[] = [];
  for (const { n } of keyed) {
    const ed = JSON.parse(fs.readFileSync(path.join(edDir, n), "utf-8")) as Edition;
    for (const it of ed.items) it._heat = heatOf(it);
    const ranked = [...ed.items].sort((a, b) => b._heat - a._heat);
    ranked.forEach((it, i) => {
      it._rank = i + 1;
    });
    editions.push(ed);
  }
  return editions;
}

export function loadLedgerFromDir(dir: string): StoreTopic[] {
  const p = path.join(dir, "state", "seen-topics.json");
  if (!fs.existsSync(p)) return [];
  const data = JSON.parse(fs.readFileSync(p, "utf-8")) as { topics?: StoreTopic[] };
  return data.topics ?? [];
}

export function loadConfigTextFromDir(dir: string): string | null {
  const p = path.join(dir, "config.yaml");
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf-8");
}

export function parseConfigText(text: string | null): Record<string, unknown> {
  if (!text) return {};
  return (parseYaml(text) ?? {}) as Record<string, unknown>;
}

export class FileStore implements SiteStore {
  constructor(private dir: string) {}
  async load(): Promise<StoreData> {
    return {
      editions: loadEditionsFromDir(this.dir),
      ledger: loadLedgerFromDir(this.dir),
      config: parseConfigText(loadConfigTextFromDir(this.dir)),
      topics: null,
    };
  }
}

/* ---------------- sqlite backend ---------------- */

interface SqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | null;
  run(...params: unknown[]): unknown;
}

interface SqliteDb {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  close(): void;
}

async function openSqlite(dbPath: string, readOnly: boolean): Promise<SqliteDb> {
  // node:sqlite is built into Node >= 22.5 and Bun >= 1.2 alike —
  // the one SQLite API every target runtime here speaks (the vite
  // preview server runs under Node's loader even when launched via
  // bun x, which rules out bun:sqlite). Dynamic import keeps the
  // module out of the Workers bundle path.
  const mod = (await import("node:sqlite")) as {
    DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => SqliteDb;
  };
  return new mod.DatabaseSync(dbPath, { readOnly });
}

function topicsFromRows(
  topicRows: Record<string, unknown>[],
  appRows: Record<string, unknown>[],
): Topic[] {
  const byKey = new Map<string, Topic>();
  const ordered: Topic[] = [];
  for (const r of topicRows) {
    const t: Topic = {
      key: r.key as string,
      name: r.name as string,
      slug: r.slug as string,
      id: "",
      apps: [],
    };
    byKey.set(t.key, t);
    ordered.push(t);
  }
  for (const r of appRows) {
    const t = byKey.get(r.topic_key as string);
    if (t) t.apps.push(JSON.parse(r.raw as string));
  }
  return ordered;
}

export class SqliteStore implements SiteStore {
  constructor(private dbPath: string) {}
  async load(): Promise<StoreData> {
    const db = await openSqlite(this.dbPath, true);
    try {
      const editions = db
        .prepare("SELECT raw FROM editions ORDER BY idx")
        .all()
        .map((r) => JSON.parse(r.raw as string) as Edition);
      const ledger = db
        .prepare("SELECT raw FROM ledger")
        .all()
        .map((r) => JSON.parse(r.raw as string) as StoreTopic);
      const cfgRow = db.prepare("SELECT value FROM config WHERE key = 'config.yaml'").get();
      const topicRows = db.prepare("SELECT key, name, slug FROM topics ORDER BY ord").all();
      const appRows = db
        .prepare("SELECT topic_key, raw FROM appearances ORDER BY topic_key, app_ord")
        .all();
      return {
        editions,
        ledger,
        config: parseConfigText((cfgRow?.value as string) ?? null),
        topics: topicsFromRows(topicRows, appRows),
      };
    } finally {
      db.close();
    }
  }
}

/* ---------------- import ---------------- */

export interface ImportReport {
  editions: number;
  items: number;
  ledgerTopics: number;
  topics: number;
  appearances: number;
  dbPath: string;
}

/** Import a data directory into a fresh SQLite database at dbPath
 * (any existing file is replaced). Topics/appearances are derived
 * with the same core buildTopics the file path uses. */
export async function importDataDir(dir: string, dbPath: string): Promise<ImportReport> {
  const editions = loadEditionsFromDir(dir);
  const ledger = loadLedgerFromDir(dir);
  const configText = loadConfigTextFromDir(dir);
  const config = parseConfigText(configText);
  const topics = buildTopics(editions, ledger, catRulesFromConfig(config) ?? undefined);

  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await openSqlite(dbPath, false);
  try {
    db.exec(DDL);
    // node:sqlite has no transaction helper; bracket the writes
    // manually (the whole import is one atomic unit).
    db.exec("BEGIN IMMEDIATE");
    let appearances = 0;
    try {
      const insEd = db.prepare(
        "INSERT INTO editions (idx, date, slot, published_at, raw) VALUES (?, ?, ?, ?, ?)",
      );
      editions.forEach((ed, i) => {
        insEd.run(i, ed.date, ed.slot ?? null, ed.published_at ?? null, JSON.stringify(ed));
      });
      const insLed = db.prepare("INSERT INTO ledger (name, raw) VALUES (?, ?)");
      for (const t of ledger) insLed.run(t.name, JSON.stringify(t));
      if (configText !== null) {
        db.prepare("INSERT INTO config (key, value) VALUES ('config.yaml', ?)").run(configText);
      }
      const insTopic = db.prepare(
        "INSERT INTO topics (key, name, slug, ord) VALUES (?, ?, ?, ?)",
      );
      const insApp = db.prepare(
        "INSERT INTO appearances (topic_key, edition_idx, app_ord, heat, raw) VALUES (?, ?, ?, ?, ?)",
      );
      topics.forEach((t, ord) => {
        insTopic.run(t.key, t.name, t.slug, ord);
        // app_ord preserves buildTopics' exact order: one topic can
        // have several appearances in the same edition (two items
        // merged into one topic), so (topic, edition) is not a key.
        t.apps.forEach((a, appOrd) => {
          insApp.run(t.key, a.edition, appOrd, a.heat, JSON.stringify(a));
          appearances += 1;
        });
      });
      db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION);
      db.prepare("INSERT INTO meta (key, value) VALUES ('source_dir', ?)").run(dir);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return {
      editions: editions.length,
      items: editions.reduce((n, e) => n + e.items.length, 0),
      ledgerTopics: ledger.length,
      topics: topics.length,
      appearances,
      dbPath,
    };
  } finally {
    db.close();
  }
}
