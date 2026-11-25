# Verify on local mode

`bun run check` proves types, lint, unit tests and dependency direction. It
does not prove that the app a user starts does the thing. This procedure does:
start an isolated instance, use it, save what it answered, stop it.

Any agent can follow it (Claude Code, Pi, Codex). The harness is
`scripts/verify-local.ts`; every command below runs from the repository
root. CI runs the whole sequence offline on every change to the apps
(`scripts/verify-local-selftest.sh` in `spike-local.yml`), so if it fails
for you and passes there, suspect your machine first.

## Launch

```sh
bun scripts/verify-local.ts up                    # site shows the placeholder
bun scripts/verify-local.ts up --fixtures busy    # site reads a fixture set
```

Sets: `busy` (en, zh, ja; a full edition), `fresh` (en, zh, ja; nothing
scanned yet), `quiet` (en only). `up` makes a run folder
`.verify/<timestamp>/` with its own data folder, picks free ports, runs the
first tick, and returns when both `/health` routes answer. It prints the
two URLs. It refuses to start a second instance: run `down` first. It never
touches `.bd-data/` or a `bun run local` you started yourself.

## Doctor

```sh
bun scripts/verify-local.ts doctor
```

Process alive, pipeline and site answer `/health`, migrations ran. Run it
first whenever a result looks wrong. If it fails: `down`, then `up`, and
read `instance.log` in the run folder.

## Drive

```sh
bun scripts/verify-local.ts tick                  # run the current slot now
bun scripts/verify-local.ts get "/?lang=ja"       # a site page
bun scripts/verify-local.ts get /health --pipeline
bun scripts/verify-local.ts sql "SELECT slot, status FROM runs"
```

`tick` calls the pipeline's `/__tick` with the instance's token. `sql`
opens the database read-only. What each feature does and how to check it is
in `features/`; start from `features/README.md`.

## Evidence

Every `tick`, `get` and `sql` saves its answer in the run folder as a
numbered file, and every command adds a row to `steps.tsv` (time, command,
result, file), including commands that fail. In a PR, cite the run folder's `steps.tsv` rows and paste the
lines that show the behavior. Proof standards:

- Use the user's path: the routes and the tick a user or the scheduler
  uses. Not internal functions, not a test-only setter.
- Capture the action and the state after it: a tick and the `runs` row it
  wrote, not only the page.
- Check side effects in the database with `sql`, alongside what a page
  shows.
- A result from the wrong surface (a unit test, a fixture you edited) is not
  a pass. Say so instead.

## Fetched content stays out of the session (invariant 6)

Since M1 a tick scans sources: the recorded fixtures with
`BD_SOURCES=fixtures`, real sources otherwise. Fixtures are scrubbed and hold
no fetched text; real sources do:

- `get` prints a page only when the instance reads fixtures. It saves real
  pages to the run folder without printing them. Do not open those files in
  a session that can write code.
- With `sql`, select ids, counts, statuses and times only. Never select
  titles, summaries, bodies or URLs of echoes.

## Cleanup

```sh
bun scripts/verify-local.ts down
```

Stops the process `up` started (by its pid, never by name, and only while
that instance's pipeline still answers, so a reused pid is never signalled),
deletes the data folder and the state file. The run folder, its log, `steps.tsv` and every
saved answer stay. `.verify/` is git-ignored; delete old run folders by hand
when you no longer need them.

## When the map is wrong

If a feature file says something the app no longer does, fix the file in the
same PR as the change that moved it. If the app gains a user-facing route or
command, add a feature file for it.
