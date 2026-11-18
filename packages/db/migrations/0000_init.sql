-- M0: tables needed by the scaffold and the spikes. Migrations only add.

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  json TEXT NOT NULL,
  changed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS source_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layer INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  min_interval_minutes INTEGER NOT NULL DEFAULT 60
);

CREATE TABLE IF NOT EXISTS runs (
  slot TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS scan_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL,
  group_id TEXT NOT NULL,
  ok INTEGER NOT NULL,
  http_status INTEGER,
  item_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS scan_results_slot ON scan_results (slot);
