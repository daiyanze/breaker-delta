/**
 * Content database schema. Same schema for D1 and local SQLite.
 * Keep this file in step with migrations/: migrations only add. A test in
 * apps/pipeline (`test/schema.test.ts`) compares the two. docs/schema.md
 * describes each table. Times are epoch milliseconds.
 */

import { ChangeTypeSchema, OutcomeSchema } from "@bd/contracts";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** A Zod enum's values in the non-empty tuple shape drizzle's `enum` takes. */
function values<T extends string>(options: readonly T[]): [T, ...T[]] {
  return options as [T, ...T[]];
}

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

export const scanResults = sqliteTable(
  "scan_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slot: text("slot").notNull(),
    groupId: text("group_id").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    httpStatus: integer("http_status"),
    itemCount: integer("item_count").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("scan_results_slot").on(t.slot)],
);

// ------------------------------------------------------------- content (#17)

/** One item on one source, identified by its normalised URL. */
export const echoes = sqliteTable(
  "echoes",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull().unique(),
    groupId: text("group_id").notNull(),
    /** The source's own title, as fetched. Data, never instructions. */
    title: text("title").notNull(),
    /** BCP 47 language of `title`; "und" when unknown. */
    lang: text("lang").notNull().default("und"),
    /** The source's own excerpt, when it gives one. */
    excerpt: text("excerpt"),
    publishedAt: integer("published_at"),
    firstSeenAt: integer("first_seen_at").notNull(),
    firstSlot: text("first_slot").notNull(),
    /** Null until assign places it. */
    topicId: text("topic_id"),
  },
  (t) => [
    index("echoes_topic").on(t.topicId),
    index("echoes_group").on(t.groupId, t.firstSeenAt),
    index("echoes_seen").on(t.firstSeenAt),
  ],
);

/** The heat a source reported for an echo at one run. */
export const echoMetrics = sqliteTable(
  "echo_metrics",
  {
    echoId: text("echo_id").notNull(),
    slot: text("slot").notNull(),
    heat: real("heat").notNull().default(0),
    seenAt: integer("seen_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.echoId, t.slot] })],
);

/** echo: not a wave yet; up: a wave; flat: a wave that has gone flat. */
export const TOPIC_STATES = ["echo", "up", "flat"] as const;

/** A set of echoes about the same thing. State and dates are set by code. */
export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    /** Stable once given; an old slug keeps naming its topic after a merge. */
    slug: text("slug").notNull().unique(),
    /** The name the assign model proposed. Used for the shortlist, not shown. */
    name: text("name").notNull(),
    state: text("state", { enum: TOPIC_STATES }).notNull().default("echo"),
    createdAt: integer("created_at").notNull(),
    formedAt: integer("formed_at"),
    wentFlatAt: integer("went_flat_at"),
    /** Set when this topic was merged into another; its slug then redirects. */
    mergedInto: text("merged_into"),
    mergedAt: integer("merged_at"),
  },
  (t) => [index("topics_state").on(t.state)],
);

/** Other names a topic is known by, for the assign shortlist. */
export const topicAliases = sqliteTable(
  "topic_aliases",
  {
    topicId: text("topic_id").notNull(),
    alias: text("alias").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.topicId, t.alias] }), index("topic_aliases_alias").on(t.alias)],
);

/**
 * Audit trail of topic corrections. A merge or a split writes one row per
 * echo it moves, so a clipping can say which topic it came from.
 */
export const topicEdits = sqliteTable(
  "topic_edits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["merge", "split", "rename", "reassign"] }).notNull(),
    /** The topic the edit leaves in place: the survivor, the renamed one, the target. */
    topicId: text("topic_id").notNull(),
    /** The other topic: merged away, split off, or the echo's previous one. */
    otherTopicId: text("other_topic_id"),
    echoId: text("echo_id"),
    /** JSON with ids and names only (e.g. the old and new name). */
    detail: text("detail"),
    /** The desk editor's id, or "pipeline". */
    editor: text("editor").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [index("topic_edits_topic").on(t.topicId, t.at)],
);

/** A topic's state, height and rank at one run, computed by `@bd/core`. */
export const wavePoints = sqliteTable(
  "wave_points",
  {
    slot: text("slot").notNull(),
    topicId: text("topic_id").notNull(),
    state: text("state", { enum: TOPIC_STATES }).notNull(),
    height: real("height").notNull(),
    /** Null when the topic is not up. */
    rank: integer("rank"),
    sourceCount: integer("source_count").notNull(),
    echoCount: integer("echo_count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.slot, t.topicId] }),
    index("wave_points_topic").on(t.topicId, t.slot),
  ],
);

/**
 * One summary attempt. A published version is never edited (invariant 4);
 * corrections and withdrawals are rows in `corrections`. A discarded attempt
 * (it failed validation) has no version and is never shown.
 */
export const summaries = sqliteTable(
  "summaries",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id").notNull(),
    /** 1, 2, ... per topic for published versions; null when discarded. */
    version: integer("version"),
    status: text("status", { enum: ["published", "discarded"] }).notNull(),
    /** Why it was written; the site words it per language. */
    reason: text("reason", { enum: ["formed", "new_echoes", "rewrite"] }).notNull(),
    /** The provider name from settings that wrote it. */
    writer: text("writer").notNull(),
    /** The fact gate's label (ADR 0006). */
    unverified: integer("unverified", { mode: "boolean" }).notNull().default(false),
    /** False when enrich could not fetch the sources' text. */
    sourceTextRead: integer("source_text_read", { mode: "boolean" }).notNull().default(true),
    /** JSON array of the model's risk flags. */
    riskFlags: text("risk_flags").notNull().default("[]"),
    slot: text("slot").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("summaries_version").on(t.topicId, t.version)],
);

/** A summary's text in one language. */
export const summaryTexts = sqliteTable(
  "summary_texts",
  {
    summaryId: text("summary_id").notNull(),
    lang: text("lang").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
  },
  (t) => [primaryKey({ columns: [t.summaryId, t.lang] })],
);

/** The echoes a summary cites, by id only (invariant 2). */
export const summaryEvidence = sqliteTable(
  "summary_evidence",
  {
    summaryId: text("summary_id").notNull(),
    echoId: text("echo_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.summaryId, t.echoId] }),
    index("summary_evidence_echo").on(t.echoId),
  ],
);

/** The change feed: seven types (ADR 0014). */
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: values(ChangeTypeSchema.options) }).notNull(),
    topicId: text("topic_id").notNull(),
    slot: text("slot").notNull(),
    at: integer("at").notNull(),
    summaryId: text("summary_id"),
    verdictId: text("verdict_id"),
    correctionId: text("correction_id"),
    /** JSON with numbers and ids written by code (e.g. the 24-hour change). */
    detail: text("detail"),
  },
  (t) => [
    uniqueIndex("events_formed_once").on(t.topicId).where(sql`type = 'wave_formed'`),
    uniqueIndex("events_detected_once")
      .on(t.topicId, t.type, t.slot)
      .where(sql`type IN ('wave_rising', 'went_flat')`),
    uniqueIndex("events_summary_once").on(t.summaryId).where(sql`type = 'summary_updated'`),
    index("events_slot").on(t.slot),
  ],
);

/**
 * The review criterion, registered once in the same write as the wave
 * forming, with a hash of its text (invariant 5). Never edited.
 */
export const predictions = sqliteTable(
  "predictions",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id").notNull().unique(),
    /** The first summary, which proposed the criterion. */
    summaryId: text("summary_id").notNull(),
    lang: text("lang").notNull(),
    criterion: text("criterion").notNull(),
    /** SHA-256 of `criterion`, lower-case hex. */
    hash: text("hash").notNull(),
    registeredAt: integer("registered_at").notNull(),
    dueAt: integer("due_at").notNull(),
  },
  (t) => [index("predictions_due").on(t.dueAt)],
);

/** Verdicts are only added; a revision is a new row (ADR 0013). */
export const verdicts = sqliteTable(
  "verdicts",
  {
    id: text("id").primaryKey(),
    predictionId: text("prediction_id").notNull(),
    outcome: text("outcome", { enum: values(OutcomeSchema.options) }).notNull(),
    /** proposed: by the model, not confirmed by a person yet. */
    status: text("status", { enum: ["proposed", "confirmed"] }).notNull(),
    lang: text("lang").notNull(),
    reason: text("reason").notNull(),
    /** JSON array of outside evidence ids the verdict cites. */
    evidenceIds: text("evidence_ids").notNull().default("[]"),
    /** The verdict this one revises; null for the first. */
    revises: text("revises"),
    /** The provider that proposed it. */
    writer: text("writer"),
    /** The desk editor who confirmed or overruled it. */
    editor: text("editor"),
    decidedAt: integer("decided_at").notNull(),
  },
  (t) => [index("verdicts_prediction").on(t.predictionId, t.decidedAt)],
);

/** A correction or withdrawal of one summary version (ADR 0006). */
export const corrections = sqliteTable(
  "corrections",
  {
    id: text("id").primaryKey(),
    summaryId: text("summary_id").notNull(),
    kind: text("kind", { enum: ["correction", "withdrawal"] }).notNull(),
    editor: text("editor").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [index("corrections_summary").on(t.summaryId)],
);

/** A correction's note to readers, in one language. */
export const correctionTexts = sqliteTable(
  "correction_texts",
  {
    correctionId: text("correction_id").notNull(),
    lang: text("lang").notNull(),
    text: text("text").notNull(),
  },
  (t) => [primaryKey({ columns: [t.correctionId, t.lang] })],
);
