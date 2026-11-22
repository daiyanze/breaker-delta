# Run the current slot again

**What it is.** The scheduler (a timer locally, cron on Cloudflare) calls the
pipeline's tick. A tick runs the current slot unless that slot already
finished or another runner holds its lease. A run that stopped halfway
resumes after its last finished step (`run_steps`).

**How to reach it.** `bun scripts/verify-local.ts tick` calls `/__tick` with
the instance's token, which is what the scheduled handler does.

**Correct looks like:**

- In a slot that already ran: `{"slot": "...", "started": false, "reason":
  "slot already ran"}`, and still one `runs` row for that slot.
- In a new slot: `"started": true, "status": "done"`, and a new `runs` row.
- Once steps exist (M1), each finished step has a `run_steps` row with
  status `done`; a failed step has status `failed` and an `error`.

**Check it:**

```sh
bun scripts/verify-local.ts up
bun scripts/verify-local.ts tick
bun scripts/verify-local.ts sql "SELECT slot, status FROM runs"
bun scripts/verify-local.ts sql "SELECT slot, step, status, attempts FROM run_steps"
bun scripts/verify-local.ts down
```

**Edges.** Without the token `/__tick` answers 404, by design. Resuming a
half-finished run needs a step that fails first; the runner's tests cover
that until M1 adds real steps.
