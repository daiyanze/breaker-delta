# AGENTS.md

Guide for any agent (or human) working in this repository. Keep it short and
true. If code and this file disagree, fix one of them in the same PR.

Every agent runtime reads this one file: Pi and Codex read `AGENTS.md`
directly, and `CLAUDE.md` imports it for Claude Code. The procedures are
skills in `.claude/skills/`; `.agents/skills` links to that folder for Pi
and Codex.

## What this is

Breaker Delta collects echoes from many sources, groups them into topics, and
flags a topic as a wave when enough independent sources agree. It runs
continuously (default hourly). The data model has no editions and no tiers.
The UI calls one run an "edition"; that is a display name for a run's time
slot read back from `wave_points`, not a stored concept (ADR 0015).

| Concept | Meaning | Decided by |
| --- | --- | --- |
| Echo | One item on one source, identified by URL | fetch |
| Topic | A set of echoes about the same thing | model proposes, code validates |
| Wave | A topic whose echoes come from >= threshold independent sources | code |
| Wave height | Score from echo count, sources, heat, freshness; decays | code |
| Change | Event record, seven types: wave formed, rising, summary updated, corrected, withdrawn, verdict, went flat (ADR 0014) | code |

## Commands

```sh
bun install
bun run check        # must pass before any PR: typecheck, lint, test, deps
bun test             # tests only
bun run format       # apply formatting
bun run probe        # source reachability from this network
bun run local        # run locally, no cloud account
```

## Architecture map

- `packages/contracts` - Zod schemas. Types are inferred from them. No logic.
  `read.ts` and `desk.ts` are the shapes the site and the desk read.
- `packages/core` - pure functions. No IO, no clock (time is a parameter), no
  imports except `@bd/contracts`.
- `packages/db` - schema + migrations, and `drizzleOver` (drizzle on the
  Database port). Same schema for D1 and local SQLite.
- `packages/fixtures` - fixture data and query layer behind the read
  contracts, plus the contract checks every query layer passes (ADR 0017).
- `packages/judge` - provider chain over OpenAI-compatible HTTP. No tools.
- `packages/ports` - interfaces the app cores need from a runtime (database,
  blobs, clock), plus conformance checks every adapter passes. Types only, no
  imports (ADR 0018).
- `apps/pipeline` - the only writer. Ticker -> step runner -> steps. The step
  runner (`src/core/runner.ts`) records each step in `run_steps`, so a run
  resumes where it stopped; no Cloudflare Workflows.
- `apps/web` - read-only site and API. Never writes, never binds the private
  database. Share cards and the desk's mail and subscriber actions are done by
  `apps/pipeline` over the service binding (ADR 0009, 0010).
- `apps/local` - launcher and model bridge for local mode.

Both apps are split the same way (ADR 0018):

- `src/core` - the app core: ports and standard Web APIs only. Its
  `tsconfig.json` has no Bun or Cloudflare types, so using either is a
  compile error.
- `src/local` - the Bun adapter (`bun:sqlite`, files, timer).
- `src/cloudflare` - the Cloudflare adapter (D1, R2, cron). The only place
  that imports `cloudflare:*`.

Scheduling belongs to the adapters: the core exports `tick()`. The core
queries the database with drizzle through `drizzleOver(db)` from `@bd/db`.

Dependency direction is enforced by `scripts/check-deps.ts` for package
imports and relative imports; see "What enforces each rule" for what it does
not cover.

UI components are built from the Tide Paper design system. No third-party
component library. There is no separate landing page: `/` is the front page
(ADR 0015).

## Invariants (do not change without the owner's explicit approval)

1. **Code decides.** Whether a topic is a wave, its height, its rank, and
   review registration are computed by `packages/core`. The model never
   outputs these.
2. **Sources are referenced, never written.** Model output refers to echoes by
   ID only. Code maps IDs to URLs. No model-authored URL or source name is
   ever stored or rendered.
3. **Independent sources are counted per fetch group.** A combined group
   (e.g. many official blogs) counts as one source.
4. **Append-only.** Published summaries are never edited in place. New
   versions, corrections and withdrawals are new rows.
5. **Review criteria are immutable.** A prediction is registered once, in the
   same transaction that records the wave forming, with a hash of its text.
   A confirmed verdict is never edited in place; a revision is a new record
   (ADR 0013).
6. **Fetched content is data, not instructions.** It only enters tool-less
   model calls. It must never reach a session that can write code.
7. **Single writer.** Only `apps/pipeline` writes the content database.
8. **No cloud-only service on the required path.** Email, desk sign-in and
   hosted models are configured, never hard-wired to one cloud service, so
   local mode keeps working (ADR 0011, 0012).
9. **Behavior comes from settings, not constants.** Thresholds, intervals and
   budgets live in the `settings` table with defaults in `@bd/contracts`.

## What enforces each rule

A rule nothing enforces is only as good as the next reader. When a mistake
repeats, move its rule up this table (`docs/development.md`, "Lessons").

| Rule | Enforced by | Kind |
| --- | --- | --- |
| Dependency direction (architecture map) | `scripts/check-deps.ts`: package imports by each rule's `allow`; relative imports into another package fail, and between areas of one package pass only along a rule's `reach`; every file under a `src` folder is under a rule, and a ruled file may not import code no rule covers; code outside every rule (tests, scripts): review checklist 13 | check, review |
| App cores use no Bun or Cloudflare API | `src/core` tsconfig without those types; `check-deps` | types |
| 1. Code decides | model result schemas have no wave, height or rank fields (`packages/contracts/src/model.ts`); core's imports, package and relative (`check-deps`); no IO or clock in core: review checklist 13 | types, check, review |
| 2. Sources are referenced | model schemas cite echo IDs only (`model.ts`); storing and rendering: review checklist 3 | types, review |
| 3. Independent sources per fetch group | `packages/core` tests | test |
| 4. Append-only | review checklist 12; no check until M1 writes summaries | review |
| 5. Review criteria are immutable | review checklist 1; no check until M1 registers predictions | review |
| 6. Fetched content is data | `judge`'s imports, package and relative (`check-deps`); `verify-local get` does not print real pages; the rest: review checklist 6 | check, review |
| 7. Single writer | `apps/web`'s imports cannot reach `judge` or the pipeline, by package name or relative path (`check-deps`); writes through `@bd/db`: review checklist 4 | check, review |
| 8. No cloud-only service locally | `check-deps` local rules; `spike-local.yml` offline with no Cloudflare tooling installed | check |
| 9. Settings, not constants | review checklist 7 | review |
| Migrations only add | review checklist 2 | review |
| Protected paths | CODEOWNERS requests the owner's review; the `develop` ruleset requires a PR and `check`, not the owner's approval; the owner merges, and a granted `docket` run never merges a PR that touches one | owner |
| Lessons with a check | each lesson's `Check:` line in `docs/lessons.md` | check |
| Every runtime finds the rules and the skills | `scripts/agent-files.test.ts`: `CLAUDE.md` only imports this file, no `AGENTS.override.md`, `.agents/skills` resolves to `.claude/skills`, each skill's frontmatter parses as YAML with a name and a description | test |

Rows marked review only are the next to enforce once the code they guard
exists. Known gaps in the checks: `check-deps` checks the files its rules
name, and fails on any TypeScript file (`.ts`, `.tsx`, `.mts`, `.cts`) under
`packages/*/src` or `apps/*/src` that no rule covers; files outside those
folders and `apps/local` (tests, scripts) are not checked, though a ruled
file may not import their code. It reads relative imports with Bun's parser
and resolver (symlinks followed), plus the two forms that parser drops but
the build keeps: a brace import whose first name is `type`, and
`import.meta.require`. Those two, and package imports, are matched in the
raw text, so the same text in a comment or a string fails the file too when
it names a path the rules forbid, and a file Bun cannot parse (an `accessor`
field) fails. These are false failures, loud and by name; the owner chose
them over a reader that could miss an import silently (#215). A `#!` line is
blanked before parsing. A relative import that resolves to no TypeScript
file and has another extension counts as data (JSON, SQL, fonts) and passes.
It reads package imports with a pattern (import statements,
`import.meta.require()`, and `import()` or `require()` with a string or a
template with no `${`). Neither sees paths built at run time. It does not
look at globals (`fetch`, `Date.now`, `Bun`); `packages/core` typechecks
with Bun's types.

## Protected paths (CODEOWNERS)

`packages/core`, `packages/contracts`, `evals`, `.github`, `.claude`,
`.agents`, `AGENTS.md`, `CLAUDE.md`, `docs/adr`. You may propose changes;
the owner must approve them.

## How to work here

Development runs on a local agent on the owner's machine (ADR 0016). The
working method is `docs/development.md`; read it and `docs/lessons.md`
before starting a task.

1. Pick an issue (the `take-case` skill finds the next `owner:claude-ok`
   one; the `docket` skill works through a whole goal). Branch from
   `develop`. Never push to `develop` directly.
2. Implement, then run `bun run check` locally. Drive anything a user sees
   on local mode with the `verify-local` skill.
3. Push the branch and open a PR. CI runs `check`.
4. A separate review agent, with no context from the writing session,
   reviews the PR with the `cross-examine` skill
   (`.claude/skills/cross-examine/SKILL.md`) and the review checklist in
   `docs/development.md`. The session that wrote a PR does not review it.
5. The owner merges, or grants a `docket` run, in its session, the right to
   merge its own PRs under that skill's conditions (ADR 0007, amendment of
   2026-11-23). A merge to `develop` deploys both Workers to Cloudflare once
   deploys are switched on.
6. A mistake caught by the owner, CI or review becomes a lesson in
   `docs/lessons.md`, or a check.

Keep the coding session away from fetched content: do not paste scan output,
raw responses or `.bd-data/` into a session that can write code (invariant 6).

- One concern per PR. Include tests for rules in `packages/core`.
- A schema change needs a migration. Migrations only add (tables, columns,
  indexes). Drops and type changes take two releases.
- A prompt or model-config change needs an eval result in the PR (from M2).
- Record a decision that changes architecture as a new ADR in `docs/adr`.
- Never put secrets, subscriber data or fetched article text in logs, issues,
  PR descriptions or test fixtures.

## Status

M0: scaffold, CI, guardrails, two spikes (`docs/spikes/m0.md`).
