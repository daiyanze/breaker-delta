/**
 * Ports: what the app core needs from the machine it runs on (ADR 0018).
 *
 * The core of `apps/pipeline` and `apps/web` depends on these interfaces and
 * on standard Web APIs (fetch, Request, Response, URL) only. Each runtime
 * provides an adapter:
 *
 * | Port      | Local (default)            | Cloudflare                 |
 * | --------- | -------------------------- | -------------------------- |
 * | Database  | bun:sqlite file            | D1                         |
 * | Blobs     | a directory                | R2                         |
 * | Clock     | Date.now                   | Date.now                   |
 * | SiteCache | the local site, in process | RPC over a service binding |
 *
 * Running a slot is not a port either: the core's step runner does it the
 * same way on every runtime.
 *
 * Scheduling is the adapter's job, not a port: the core exports `tick()`
 * and each adapter decides when to call it (an in-process timer locally, a
 * cron trigger on Cloudflare). The core never asks to be woken up.
 *
 * The core reads and writes through `drizzleOver(db)` from `@bd/db`, which
 * puts the drizzle schema and query builder on top of this small port.
 *
 * Types only. No runtime code, no imports.
 */

/** A value SQLite stores. Booleans are written as 0 and 1. */
export type SqlValue = string | number | bigint | Uint8Array | null;

export type Row = Record<string, SqlValue>;

/** A statement with positional parameters `?1`, `?2`, ... in the SQLite dialect. */
export interface Statement {
  sql: string;
  params?: readonly SqlValue[];
}

/**
 * The content database. One schema and one set of migrations for every
 * adapter (`packages/db`). Every method is async so a remote database fits.
 */
export interface Database {
  /** Every row the statement returns, in order. */
  all<T = Row>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  /**
   * Every row as an array of column values, in select order. Query builders
   * use this (drizzle's sqlite-proxy driver, see `@bd/db`), because column
   * names can repeat across joined tables while positions cannot.
   */
  values(sql: string, ...params: SqlValue[]): Promise<SqlValue[][]>;
  /** The first row, or null when there is none. */
  first<T = Row>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  /** A statement that returns no rows. `changes` is the number of rows written. */
  run(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>;
  /**
   * Several statements in one transaction: all of them apply or none does.
   * This is how a wave forming and its prediction are written together
   * (invariant 5).
   */
  batch(statements: readonly Statement[]): Promise<void>;
}

/**
 * Object storage for raw responses, share cards, snapshots and exports.
 * A key is `/`-separated segments of letters, digits, `.`, `_` and `-`, none
 * starting with `.`, e.g. `raw/20261201T0900/hackernews.json`. An adapter
 * may refuse any other key.
 */
export interface Blobs {
  /** The stored bytes, or null when there is no such key. */
  get(key: string): Promise<Uint8Array | null>;
  /** Stores `body` (a string as UTF-8), replacing what the key held. */
  put(key: string, body: Uint8Array | string, contentType?: string): Promise<void>;
  /** Removes the key; a key that does not exist is not an error. */
  delete(key: string): Promise<void>;
  /** Keys that start with `prefix`, sorted. */
  list(prefix: string): Promise<string[]>;
}

/** Wall-clock time. A port so tests can fix it; `packages/core` takes time as a parameter. */
export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

/** What the pipeline tells the site after a run's commit: ids only (invariant 6). */
export interface PurgeRequest {
  slot: string;
  /** Topics whose pages the run changed (a new version or a discarded draft). */
  topicIds: string[];
}

export interface PurgeResult {
  /** Cached entries the site dropped. */
  purged: number;
}

/**
 * The site's cache, as the pipeline's publish step sees it (#35, ADR 0009:
 * "the publish step only purges caches"). The site only reads: purging drops
 * cached responses and never writes the content database (invariant 7).
 */
export interface SiteCache {
  purge(request: PurgeRequest): Promise<PurgeResult>;
}
