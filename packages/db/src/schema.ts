/**
 * Content database schema. Same schema for D1 and local SQLite.
 * M0 holds only the tables the scaffold and the spikes need. The remaining
 * tables (echoes, topics, summaries, events, predictions...) arrive in M1.
 * Keep this file in step with migrations/: migrations only add.
 */
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Single-row table: the validated settings JSON. */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  json: text("json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const settingsHistory = sqliteTable("settings_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  json: text("json").notNull(),
  changedAt: integer("changed_at").notNull(),
});

export const sourceGroups = sqliteTable("source_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** 1 = discovery, 2 = spread, 3 = verification only (never yields echoes). */
  layer: integer("layer").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  minIntervalMinutes: integer("min_interval_minutes").notNull().default(60),
});

/** One pipeline run. `slot` is unique: a slot can only run once. */
export const runs = sqliteTable("runs", {
  slot: text("slot").primaryKey(),
  status: text("status", { enum: ["running", "done", "failed"] }).notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  /** Epoch ms until which a runner holds this run. Null: nobody does. */
  leaseUntil: integer("lease_until"),
});

/** One finished or failed step of a run (the step runner, #171). */
export const runSteps = sqliteTable(
  "run_steps",
  {
    slot: text("slot").notNull(),
    step: text("step").notNull(),
    status: text("status", { enum: ["done", "failed"] }).notNull(),
    attempts: integer("attempts").notNull(),
    /** The step's result as JSON: ids and counts, never fetched text. */
    output: text("output"),
    /** A short error class and message for a failed step. */
    error: text("error"),
    finishedAt: integer("finished_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.slot, t.step] })],
);

export const scanResults = sqliteTable("scan_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slot: text("slot").notNull(),
  groupId: text("group_id").notNull(),
  ok: integer("ok", { mode: "boolean" }).notNull(),
  httpStatus: integer("http_status"),
  itemCount: integer("item_count").notNull().default(0),
  error: text("error"),
});
