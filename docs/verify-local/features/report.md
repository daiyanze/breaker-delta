# Read the run report

**What it is.** The pipeline's `/__report` (#53) answers with aggregate
metrics over the last `reportWindowDays` (default 7) UTC days of run slots:
run counts and durations, per-day run counts, per-step results and
attempts, and model calls with their tokens per day, task, provider and
model. It holds counts, durations, names and days only: no echo or topic
text, no URL, no step output or error message, no email address. It never
writes, not even the settings seed.

**How to reach it.** `GET /__report` on the pipeline with
`Authorization: Bearer <REPORT_TOKEN>`. `REPORT_TOKEN` is an environment
variable locally and a Worker secret on Cloudflare. Without it the route
does not exist. `bun scripts/verify-local.ts report` calls it with the
instance's token.

**Correct looks like:**

- `200` and JSON with `window` (`days`, `fromDay`, `toDay`), `runs`,
  `days`, `steps` and `models`.
- After the start-up tick, `runs.total` is the number of `runs` rows in the
  window, and `steps` lists the steps in `run_steps`.

**Check it:**

```sh
bun scripts/verify-local.ts up
bun scripts/verify-local.ts report
bun scripts/verify-local.ts sql "SELECT count(*) AS runs FROM runs"
bun scripts/verify-local.ts sql "SELECT step, status, attempts FROM run_steps"
bun scripts/verify-local.ts get /__report --pipeline
bun scripts/verify-local.ts down
```

**Edges.** `get /__report --pipeline` sends no token and answers 404, by
design; so does a wrong token, the probe token, or any token when
`REPORT_TOKEN` is unset. The window boundary, the no-text rule and the token
cases are covered by `apps/pipeline/test/report.test.ts`.
