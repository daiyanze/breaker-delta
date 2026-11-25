-- M2-07 (#48): where each summary came from, and what each run's model
-- calls used. Migrations only add. docs/schema.md describes each column.

-- The model that wrote a summary (`writer` is its provider) and the version
-- of the prompt it was sent. Null on rows written before #48, and
-- prompt_version is null while a prompt has no version.
ALTER TABLE summaries ADD COLUMN model TEXT;
ALTER TABLE summaries ADD COLUMN prompt_version TEXT;

-- One HTTP call a model step made in a run: provider, model, outcome,
-- whether the chain had fallen back, and the tokens the response reported.
-- No keys, no messages, no error text.
CREATE TABLE IF NOT EXISTS model_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL,
  task TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT,
  outcome TEXT NOT NULL,
  fallback INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  at INTEGER NOT NULL,
  CONSTRAINT model_calls_task CHECK (task IN ('assign', 'summarize')),
  CONSTRAINT model_calls_outcome CHECK (outcome IN ('ok', 'invalid', 'error'))
);

CREATE INDEX IF NOT EXISTS model_calls_slot ON model_calls (slot);
