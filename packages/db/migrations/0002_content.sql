-- M1-01 (#17): the content tables. Migrations only add.
-- Times are epoch milliseconds. Ids are text, made by the pipeline.
-- No foreign keys: D1 enforces them and local SQLite does not by default,
-- and both runtimes must behave the same. CHECKs hold the enums drizzle
-- types, so a raw write cannot store a value no reader expects. docs/schema.md describes each table.

-- One item on one source, identified by its normalised URL.
CREATE TABLE IF NOT EXISTS echoes (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'und',
  excerpt TEXT,
  published_at INTEGER,
  first_seen_at INTEGER NOT NULL,
  first_slot TEXT NOT NULL,
  topic_id TEXT
);

CREATE INDEX IF NOT EXISTS echoes_topic ON echoes (topic_id);
CREATE INDEX IF NOT EXISTS echoes_group ON echoes (group_id, first_seen_at);
CREATE INDEX IF NOT EXISTS echoes_seen ON echoes (first_seen_at);

-- The heat a source reported for an echo at one run.
CREATE TABLE IF NOT EXISTS echo_metrics (
  echo_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  heat REAL NOT NULL DEFAULT 0,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (echo_id, slot)
);

-- A set of echoes about the same thing.
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'echo',
  created_at INTEGER NOT NULL,
  formed_at INTEGER,
  went_flat_at INTEGER,
  merged_into TEXT,
  merged_at INTEGER,
  CONSTRAINT topics_state CHECK (state IN ('echo', 'up', 'flat'))
);

CREATE INDEX IF NOT EXISTS topics_state ON topics (state);

-- Other names a topic is known by, for the assign shortlist.
CREATE TABLE IF NOT EXISTS topic_aliases (
  topic_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (topic_id, alias)
);

CREATE INDEX IF NOT EXISTS topic_aliases_alias ON topic_aliases (alias);

-- Audit trail of topic corrections: merge, split, rename, reassign.
CREATE TABLE IF NOT EXISTS topic_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  other_topic_id TEXT,
  echo_id TEXT,
  detail TEXT,
  editor TEXT NOT NULL,
  at INTEGER NOT NULL,
  CONSTRAINT topic_edits_kind CHECK (kind IN ('merge', 'split', 'rename', 'reassign'))
);

CREATE INDEX IF NOT EXISTS topic_edits_topic ON topic_edits (topic_id, at);

-- A topic's height, rank and state at one run, computed by code.
CREATE TABLE IF NOT EXISTS wave_points (
  slot TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  state TEXT NOT NULL,
  height REAL NOT NULL,
  rank INTEGER,
  source_count INTEGER NOT NULL,
  echo_count INTEGER NOT NULL,
  PRIMARY KEY (slot, topic_id),
  CONSTRAINT wave_points_state CHECK (state IN ('echo', 'up', 'flat'))
);

CREATE INDEX IF NOT EXISTS wave_points_topic ON wave_points (topic_id, slot);

-- One summary attempt. Published versions are never edited (invariant 4);
-- a discarded attempt has no version and is never shown.
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  version INTEGER,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  writer TEXT NOT NULL,
  unverified INTEGER NOT NULL DEFAULT 0,
  source_text_read INTEGER NOT NULL DEFAULT 1,
  risk_flags TEXT NOT NULL DEFAULT '[]',
  slot TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CONSTRAINT summaries_reason CHECK (reason IN ('formed', 'new_echoes', 'rewrite')),
  CONSTRAINT summaries_version CHECK ((status = 'published' AND version IS NOT NULL) OR (status = 'discarded' AND version IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS summaries_version ON summaries (topic_id, version);

-- A summary's text in one language.
CREATE TABLE IF NOT EXISTS summary_texts (
  summary_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (summary_id, lang)
);

-- The echoes a summary cites, by id (invariant 2).
CREATE TABLE IF NOT EXISTS summary_evidence (
  summary_id TEXT NOT NULL,
  echo_id TEXT NOT NULL,
  PRIMARY KEY (summary_id, echo_id)
);

CREATE INDEX IF NOT EXISTS summary_evidence_echo ON summary_evidence (echo_id);

-- The change feed: seven types (ADR 0014).
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  at INTEGER NOT NULL,
  summary_id TEXT,
  verdict_id TEXT,
  correction_id TEXT,
  detail TEXT,
  CONSTRAINT events_type CHECK (type IN ('wave_formed', 'wave_rising', 'summary_updated', 'corrected', 'withdrawn', 'verdict', 'went_flat'))
);

-- A topic forms once, and a resumed run cannot write the events the
-- compute step detects twice. Desk events (corrected, withdrawn, verdict)
-- may repeat within a run.
CREATE UNIQUE INDEX IF NOT EXISTS events_formed_once ON events (topic_id) WHERE type = 'wave_formed';
CREATE UNIQUE INDEX IF NOT EXISTS events_detected_once ON events (topic_id, type, slot) WHERE type IN ('wave_rising', 'went_flat');
CREATE UNIQUE INDEX IF NOT EXISTS events_summary_once ON events (summary_id) WHERE type = 'summary_updated';
CREATE INDEX IF NOT EXISTS events_slot ON events (slot);

-- The review criterion, registered once with the wave forming (invariant 5).
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL UNIQUE,
  summary_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  criterion TEXT NOT NULL,
  hash TEXT NOT NULL,
  registered_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS predictions_due ON predictions (due_at);

-- Verdicts are only added: a revision is a new row (ADR 0013).
CREATE TABLE IF NOT EXISTS verdicts (
  id TEXT PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  status TEXT NOT NULL,
  lang TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  revises TEXT,
  writer TEXT,
  editor TEXT,
  decided_at INTEGER NOT NULL,
  CONSTRAINT verdicts_outcome CHECK (outcome IN ('hit', 'partial', 'miss', 'undetermined')),
  CONSTRAINT verdicts_status CHECK (status IN ('proposed', 'confirmed'))
);

CREATE INDEX IF NOT EXISTS verdicts_prediction ON verdicts (prediction_id, decided_at);

-- A correction or withdrawal of one summary version (ADR 0006).
CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  summary_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  editor TEXT NOT NULL,
  at INTEGER NOT NULL,
  CONSTRAINT corrections_kind CHECK (kind IN ('correction', 'withdrawal'))
);

CREATE INDEX IF NOT EXISTS corrections_summary ON corrections (summary_id);

-- A correction's note to readers, in one language.
CREATE TABLE IF NOT EXISTS correction_texts (
  correction_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (correction_id, lang)
);
