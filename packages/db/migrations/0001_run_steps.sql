-- Step runner (ADR 0018, #171). Migrations only add.

-- A run holds a lease while it executes, so two ticks never run one slot
-- at the same time. NULL means nobody holds it.
ALTER TABLE runs ADD COLUMN lease_until INTEGER;

-- One row per finished or failed step of a run. A run that stops halfway
-- resumes after the last step recorded as done.
CREATE TABLE IF NOT EXISTS run_steps (
  slot TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  output TEXT,
  error TEXT,
  finished_at INTEGER NOT NULL,
  PRIMARY KEY (slot, step)
);
