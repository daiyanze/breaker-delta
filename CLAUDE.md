# CLAUDE.md

Guide for any agent (or human) working in this repository. Keep it short and
true. If code and this file disagree, fix one of them in the same PR.

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
- `packages/core` - pure functions. No IO, no clock (time is a parameter), no
  imports except `@bd/contracts`.
- `packages/db` - schema + migrations. Same schema for D1 and local SQLite.
- `packages/judge` - provider chain over OpenAI-compatible HTTP. No tools.
- `apps/pipeline` - the only writer. Ticker -> RunWorkflow -> steps.
- `apps/web` - read-only site and API. Never writes, never binds the private
  database. Share cards and the desk's mail and subscriber actions are done by
  `apps/pipeline` over the service binding (ADR 0009, 0010).
- `apps/local` - launcher and model bridge for local mode.

Dependency direction is enforced by `scripts/check-deps.ts`.

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

## Protected paths (CODEOWNERS)

`packages/core`, `packages/contracts`, `evals`, `.github`, `CLAUDE.md`,
`docs/adr`. You may propose changes; the owner must approve them.

## How to work here

- One concern per PR. Include tests for rules in `packages/core`.
- A schema change needs a migration. Migrations only add (tables, columns,
  indexes). Drops and type changes take two releases.
- A prompt or model-config change needs an eval result in the PR (from M2).
- Record a decision that changes architecture as a new ADR in `docs/adr`.
- Never put secrets, subscriber data or fetched article text in logs, issues,
  PR descriptions or test fixtures.

## Status

M0: scaffold, CI, guardrails, two spikes (`docs/spikes/m0.md`).
