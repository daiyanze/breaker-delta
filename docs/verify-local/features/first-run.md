# Start local mode and get a first run

**What it is.** A user runs `bun run local` (or the downloaded executable)
with no cloud account. One process starts the pipeline and the site, creates
the database, and runs the current slot straight away: every step, from scan
to retention (#40).

**How to reach it.** `bun scripts/verify-local.ts up` starts it the same way,
with its own data folder and free ports. It always sets `BD_SOURCES=fixtures`
and `MODEL_DRIVER=fake`, so the run scans each group's recorded fixture
(embedded in the build, so the executable scans the same ones), calls no
provider and fetches nothing real. By hand:
`BD_SOURCES=fixtures MODEL_DRIVER=fake bun run local`.

**Correct looks like:**

- `up` reports `"ready": true` with a pipeline URL and a site URL.
- `doctor` reports `ok`, including `database: true` (migrations ran).
- The pipeline's `/health` returns `ok: true` and a `lastRun` whose status
  is `done` once the first tick ends.
- The `runs` table has one row for the current slot, status `done`, and
  `run_steps` has 11 rows for it (scan, ingest, assign, compute, changes,
  select, summarize, validate, commit, publish, retention), all `done`.
- The database holds echoes, topics, wave points and events. On the
  recorded fixtures with the fake model: 70 echoes, 57 topics, 57 wave
  points (2 `up`), 2 `wave_formed` events, 2 published summaries. Counts
  move when fixtures are re-recorded; zero in any of the four is a failure.

**Check it** (ids, counts and statuses only: never select titles, bodies or
URLs):

```sh
bun scripts/verify-local.ts up
bun scripts/verify-local.ts doctor
bun scripts/verify-local.ts get /health --pipeline
bun scripts/verify-local.ts sql "SELECT slot, status, started_at, finished_at FROM runs"
bun scripts/verify-local.ts sql "SELECT step, status, attempts FROM run_steps ORDER BY rowid"
bun scripts/verify-local.ts sql "SELECT (SELECT COUNT(*) FROM echoes) AS echoes, (SELECT COUNT(*) FROM topics) AS topics, (SELECT COUNT(*) FROM wave_points) AS wave_points, (SELECT COUNT(*) FROM events) AS events"
bun scripts/verify-local.ts sql "SELECT type, COUNT(*) AS n FROM events GROUP BY type"
bun scripts/verify-local.ts down
```

**Edges.** A restart keeps the data; `spike-local.ts` checks that. A slot is
`runIntervalMinutes` long (a setting, default 60), so a first run near the top of the
hour may be followed by a second slot soon after. With no `MODEL_DRIVER`
(the default for `bun run local`), assign's model calls fail and the run
still ends `done`: echoes, but no topics, wave points or events.
