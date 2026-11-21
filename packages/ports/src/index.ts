/**
 * Ports: what the app core needs from the machine it runs on (ADR 0018).
 *
 * The core of `apps/pipeline` and `apps/web` depends on these interfaces and
 * on standard Web APIs (fetch, Request, Response, URL) only. Each runtime
 * provides an adapter:
 *
 * | Port        | Local (default)    | Cloudflare            |
 * | ----------- | ------------------ | --------------------- |
 * | Database    | bun:sqlite file    | D1                    |
 * | Blobs       | a directory        | R2                    |
 * | Clock       | Date.now           | Date.now              |
 * | RunExecutor | step runner (#171) | step runner (#171)    |
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

/** Object storage for share cards, snapshots and exports. Keys are `/`-separated paths. */
export interface Blobs {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, body: Uint8Array | string, contentType?: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys that start with `prefix`, sorted. */
  list(prefix: string): Promise<string[]>;
}

/** Wall-clock time. A port so tests can fix it; `packages/core` takes time as a parameter. */
export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

/**
 * Starts the run for one slot. It must reject when that slot has already
 * started, so two ticks can never start the same slot twice.
 * Until the step runner lands (#171), the Cloudflare adapter starts a
 * Workflow instance whose id is the slot.
 */
export interface RunExecutor {
  start(slot: string): Promise<void>;
}
