// The same schema as lib/store.ts (DDL is shared verbatim) over a
// Cloudflare D1 binding, for the Workers target. Wiring the binding
// into the app's request context happens at the P2c cutover; this
// class is exercised against the identical SQL the SQLite backend
// runs, so behaviour carries over.

import {
  catRulesFromConfig,
  buildTopics,
  type Edition,
  type StoreTopic,
  type Topic,
} from "@breaker-delta/core";

import { parseConfigText, type SiteStore, type StoreData } from "./store";

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

interface RawRow {
  raw: string;
}

const PAGE = 5000;

export class D1Store implements SiteStore {
  constructor(private db: D1Database) {}

  async load(): Promise<StoreData> {
    const edRes = await this.db.prepare("SELECT raw FROM editions ORDER BY idx").all<RawRow>();
    const editions = edRes.results.map((r) => JSON.parse(r.raw) as Edition);
    const ledRes = await this.db.prepare("SELECT raw FROM ledger").all<RawRow>();
    const ledger = ledRes.results.map((r) => JSON.parse(r.raw) as StoreTopic);
    const cfg = await this.db
      .prepare("SELECT value FROM config WHERE key = 'config.yaml'")
      .first<{ value: string }>();
    const config = parseConfigText(cfg?.value ?? null);

    const topicRes = await this.db
      .prepare("SELECT key, name, slug FROM topics ORDER BY ord")
      .all<{ key: string; name: string; slug: string }>();
    const byKey = new Map<string, Topic>();
    const topics: Topic[] = [];
    for (const r of topicRes.results) {
      const t: Topic = { key: r.key, name: r.name, slug: r.slug, id: "", apps: [] };
      byKey.set(t.key, t);
      topics.push(t);
    }
    // Appearances in pages: D1 caps rows per query, and a year of
    // data is ~6k appearances — page rather than assume.
    for (let offset = 0; ; offset += PAGE) {
      const res = await this.db
        .prepare(
          "SELECT topic_key, raw FROM appearances ORDER BY topic_key, app_ord LIMIT ? OFFSET ?",
        )
        .bind(PAGE, offset)
        .all<{ topic_key: string; raw: string }>();
      for (const r of res.results) {
        const t = byKey.get(r.topic_key);
        if (t) t.apps.push(JSON.parse(r.raw));
      }
      if (res.results.length < PAGE) break;
    }
    if (topics.length === 0 && editions.length > 0) {
      // A database written before derived rows existed (or by hand):
      // fall back to computing topics, exactly like the file store.
      return {
        editions,
        ledger,
        config,
        topics: buildTopics(editions, ledger, catRulesFromConfig(config) ?? undefined),
      };
    }
    return { editions, ledger, config, topics };
  }
}
