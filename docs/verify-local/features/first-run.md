# Start local mode and get a first run

**What it is.** A user runs `bun run local` (or the downloaded executable)
with no cloud account. One process starts the pipeline and the site, creates
the database, and runs the current slot straight away.

**How to reach it.** `bun scripts/verify-local.ts up` starts it the same way,
with its own data folder and free ports.

**Correct looks like:**

- `up` reports `"ready": true` with a pipeline URL and a site URL.
- `doctor` reports `ok`, including `database: true` (migrations ran).
- The pipeline's `/health` returns `ok: true` and a `lastRun` whose status
  is `done` once the first tick ends. In M0 a run has no steps, so it ends
  at once.
- The `runs` table has one row for the current slot, status `done`.

**Check it:**

```sh
bun scripts/verify-local.ts up
bun scripts/verify-local.ts doctor
bun scripts/verify-local.ts get /health --pipeline
bun scripts/verify-local.ts sql "SELECT slot, status, started_at, finished_at FROM runs"
bun scripts/verify-local.ts down
```

**Edges.** A restart keeps the data; `spike-local.ts` checks that. A slot is
`runIntervalMinutes` long (a setting, default 60), so a first run near the top of the
hour may be followed by a second slot soon after.
