# How changes are made

The method every coding agent (Claude Code, Pi, Codex, ...) and every human
follows in this repository. `CLAUDE.md` holds the rules; this file holds the
working method. Read `docs/lessons.md` before starting.

Sources: Karpathy's LLM coding guidelines
(github.com/multica-ai/andrej-karpathy-skills), Anthropic's Claude Code
best practices (explore, plan, code, commit; show evidence, not claims), and
the pstack plugin (github.com/cursor/plugins, `pstack`: verify on the real
surface, playbooks per kind of work, exit conditions for long runs, a rule
for each mistake and what enforces it).

## Four principles

1. **Think before coding.** State assumptions. If a request can be read two
   ways, say so instead of picking one silently. If a simpler approach exists,
   say so.
2. **Simplicity first.** The minimum code that solves the issue. No features,
   abstractions or configuration nobody asked for.
3. **Surgical changes.** Every changed line traces to the issue. Do not
   reformat, refactor or "improve" neighbouring code. Remove only what your
   own change made unused; mention other dead code instead of deleting it.
4. **Goal-driven execution.** Turn the issue's acceptance criteria into checks
   (a test, a command, an observable result) and loop until they pass.

## Picking work

Issues labelled `owner:claude-ok` are the agent's to do; `owner:human` and
`owner:human+claude` need the owner. A local session finds the next
one with `/next` (`.claude/commands/next.md`), or takes the one the owner
names. Nothing on GitHub starts work by itself (ADR 0016).

## Cloudflare credential

ADR 0019 sets the rules; this is where the token lives and how it is used.

**Every wrangler call that reaches Cloudflare goes through
`scripts/cf.sh`**, for example `scripts/cf.sh whoami`. Commands that need a
`wrangler.jsonc` run from the app folder: `cd apps/pipeline &&
../../scripts/cf.sh deploy`, which is what `bun run deploy` does there.
Local `wrangler dev` needs no token. The script loads the
agent's token into that one command. If it finds no token, or a malformed one, it stops, so
wrangler never falls back to the owner's `wrangler login`. Do not export the
token yourself: variables do not carry over between an agent's shell calls,
and wrangler uses a stored login when `CLOUDFLARE_API_TOKEN` is empty.

The owner stores the token and the account ID once. The token is the
account API token (`cfat_...`); the account ID is the 32 lowercase hex
digits in the dashboard URL. Paste each into its own item: the script
refuses a value with the other one's shape. On macOS, use the keychain:

```sh
# -U replaces an existing item. -w last, with no value, prompts for the secret.
security add-generic-password -U -a "$USER" -s breaker-delta-cloudflare-token -w
security add-generic-password -U -a "$USER" -s breaker-delta-cloudflare-account -w
```

- **Linux, with a running Secret Service** (GNOME Keyring or KWallet):
  `secret-tool store --label="Breaker Delta Cloudflare token" service breaker-delta-cloudflare-token`.
  Store `breaker-delta-cloudflare-account` the same way. It prompts for the
  value.
- **Elsewhere (Windows with Git Bash, or no keychain):** use
  `~/.config/breaker-delta/cloudflare.env` with mode 600, holding the lines
  `CLOUDFLARE_API_TOKEN=...` and `CLOUDFLARE_ACCOUNT_ID=...`. The script
  reads the file; it does not source it.

The first time, check that `scripts/cf.sh whoami` reports an account API
token, not an OAuth login.

Rules:

- Never read, print or `cat` the env file or a keychain item. Only
  `scripts/cf.sh` reads them.
- Do not put the token in Claude Code's `settings.json` `env`. That hands it
  to every command of every session.
- If the script says no token was found, stop and tell the owner. Do not ask
  for the value in the chat.

## The loop

1. **Explore.** Read the issue, `CLAUDE.md`, the ADRs it touches,
   `docs/lessons.md` and the code involved. Before choosing an approach,
   check what the design already decided (ADRs, `packages/db` schema,
   contracts).
2. **Plan.** List assumptions and every point where the plan differs from an
   ADR or an earlier decision. A difference from an ADR is the owner's call:
   ask before building on it. Everything else: decide, note it, carry on.
   Before writing logic, name the data shape: the types, the table or the
   state the change works on. If the change crosses a package or a function
   boundary, sketch two shapes (types, signatures, which module owns what)
   and pick the one where each piece of state has one owner and callers
   need to know least. Put both in the PR when the choice was close.
3. **Code.** Tests first for rules (`packages/core`, contracts, adapters).
   Keep each PR to one concern.
4. **Verify.** Run `bun run check`. Report evidence: commands and their
   results. If a check cannot run here (no network, no tool), say which one
   and wait for CI before calling the work done. If the change is something
   a user can see or do (a page, a route, a tick, the launcher), also drive
   it on local mode with the `verify-local` skill
   (`.claude/skills/verify-local/SKILL.md`) and cite its `steps.tsv`. A unit
   test shows a branch works; it does not show the app does the thing.
5. **PR.** Title: `type(scope): subject`, as in the commit log. The
   description has these headings, empty ones dropped: `## Why` (the goal,
   first), `## What changed`, `## Scope` (protected paths, ADR deviations,
   what is left out), `## Verification` (commands and results, and what was
   not verified locally). Claims such as "behaviour unchanged" come with the
   test that shows it.
6. **Review.** A separate agent with no context from the writing session
   reviews the PR with `.claude/commands/review.md`. The writer fixes
   blocking issues; a new agent re-reviews. After three rounds the owner
   decides.
7. **Learn.** When the owner corrects something, or CI or review catches a
   mistake the writer made, add a lesson (below). Do it in the same PR when
   the lesson is about that PR.

## Kinds of work

The loop above is the default. Two kinds of work add steps.

**Bug fix.** Every changed line traces to evidence from a run.

1. Reproduce it yourself on the surface where it happens: `verify-local` for
   the app, a failing test for a pure function. Ask the owner only after
   driving it as far as it goes, and say why it cannot go further.
2. Find the cause by elimination: list the candidate causes, then take the
   check that rules out the most of them, until one is left. When state is
   unclear, add logging and read it; do not guess.
3. Fix it where it first went wrong. A guard that hides a state is a fix
   only when that state is legitimate.
4. The failing test or repro lands in its own commit before the fix, so the
   history shows it failing and then passing. Paste both outputs in the PR.
5. Nothing that "might help" ships. If evidence refutes a hypothesis, revert
   what it motivated.

**Feature.** The data shape is decided before any logic (step 2 above).

1. Trace the code the feature touches, then name the shape. Prefer one
   structure (a table, a typed model, a state machine) over conditionals
   spread across files.
2. Build in small units that each end in a passing check, and commit each
   before starting the next.
3. Verify on local mode for anything a user sees, and add or update the
   feature file in `.claude/skills/verify-local/features/`.

## Long runs

When the owner gives a goal rather than an issue ("finish UI M2", "clear
every open M1 issue you can"), run `/run` (`.claude/commands/run.md`). It
loops `/next` until a stated exit condition holds, without stopping to ask
for "continue". The rules:

- **Exit condition first.** Before the first issue, write it as something a
  command can check, for example "every `owner:claude-ok` issue in M1 whose
  dependencies are merged has an open PR with green CI and an approving
  review". Never relax it to finish. A plateau is a reason to change
  approach, not to stop.
- **Decision log.** One TSV file per run in `.runs/` (git-ignored): one row
  per decision, with time, phase, decision, why, evidence (a PR, a SHA, a
  file) and result. Not every action: forks taken, units finished with
  their check result, reverts and blockers.
- **Pick up, do not redo.** A new session continuing a run reads the log,
  the open PRs and `git log` first, names the resume point, and checks
  inherited claims against CI and the code rather than redoing the work.
- **Stops.** The owner merges; a run never does. It stops for the owner on
  an ADR conflict, a secret or account it needs, a protected path the issue
  does not mention, three review rounds without approval, or anything that
  cannot be undone (deploys, data deletion, messages to people). It parks
  that issue, logs why, and moves to the next one.

## Lessons

`docs/lessons.md` is the project's memory of mistakes, so they are not
repeated. Rules for it:

- **When to add one:** the owner corrected the work; CI or review caught a
  mistake the writer made; the same problem happened twice.
- **What an entry holds:** what happened (with a PR link), a one-line rule,
  its scope (which paths or kinds of work it applies to), and the evidence.
  Scope keeps a lesson from being applied where it does not fit.
- **Prefer a check, at the highest level that works.** In order:
  architecture (one owner, one way, so the mistake cannot be written), types
  or `scripts/check-deps.ts` (it fails to compile or to pass `check`), a
  lint or CI check whose message names the fix, a test, and only then
  written rules. Keep the lesson as a pointer to its check. Prove a new
  check fails on the mistake it is for (L7).
- **A repeat is a level-up.** If a mistake comes back while its lesson or
  rule exists, the rule did not work: enforce it one level higher, and
  update "What enforces each rule" in `CLAUDE.md`. When that touches a
  protected path the issue does not mention, open it as its own PR for the
  owner instead of adding it to the issue's PR; in a long run, the issue is
  not parked for it.
- **Retire, do not delete.** A lesson that turns out wrong or obsolete is
  marked retired with the reason, so the record stays honest.
- **Keep it short.** Merge duplicates. If the file grows past what an agent
  reads in a minute, promote the durable rules to `CLAUDE.md` or a check.
