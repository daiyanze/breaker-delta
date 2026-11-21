# Lessons

Mistakes made while building Breaker Delta, kept so they are not repeated.
How to add, scope and retire entries: `docs/development.md`. Newest first.
Each rule applies only within its scope.

## L8 Read the installed version's API before writing against a library

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** #179 wrote the Miniflare calls from memory of v3/v4.
  The lockfile has Miniflare 5 (beta), whose options moved under
  `workers[].config`. Two CI rounds failed before the source was read; it
  offers `convertV4MiniflareOptions` for the flat shape.
- **Rule:** Before calling a dependency, check the version in `bun.lock` and
  read that version's types, source or changelog. Memory of an older major
  version is not documentation.
- **Scope:** any code against a third-party package, especially pre-1.0,
  beta or recently bumped ones.
- **Evidence:** CI runs on #179.

## L7 Prove a new guard catches a violation where it is meant to

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** #178 said its check-deps rules keep Cloudflare off the
  local path. The rules covered `src/local`, but not `apps/web/src/select.ts`,
  which is on the same path, and a rule naming a single file was silently
  skipped. The independent review found it with a throwaway tree.
- **Rule:** When a PR claims a check enforces something, add a test that puts
  a violation in every place the claim covers and shows the check reports it.
- **Scope:** `scripts/check-deps.ts`, lint and type configurations, any guard.
- **Evidence:** fixed in #178; the check-deps test now plants a violation in
  `select.ts`.

## L6 Every way a step can fail must end in the step's failure record

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** In #177 the runner serialised a step's output outside
  the retry `try`. An output that cannot be serialised would have thrown out
  of `runSlot`, leaving the run `running` and retried after every lease
  expiry, never marked failed. The independent review found it.
- **Rule:** In the runner and in steps, everything between "the step
  started" and "the step's result is stored" sits inside the failure
  handling, so a failure is recorded, never escapes.
- **Scope:** `apps/pipeline/src/core/runner.ts` and pipeline steps.
- **Evidence:** fixed in #177, with the test "an output that cannot be
  stored is a failed attempt".

## L5 Check the design before picking a lower-level approach

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** #175 gave the Database port raw SQL only, while
  `packages/db` already defined the schema in drizzle and ADR 0018 said
  drizzle would be used. The PR presented it as a design choice, not as a
  deviation. The owner had to ask.
- **Rule:** Before choosing an approach, check the ADRs, the schema and the
  contracts for what was already decided. When the plan differs, call it a
  deviation in the PR and ask before building on it.
- **Scope:** any design choice in a PR.
- **Evidence:** fixed in #175 (drizzle on the port, `drizzleOver`).

## L4 Check a result against the owner's principles, not only the pass list

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** Spike 1 (#168) passed every listed criterion by running
  the Workers runtime locally through wrangler, and the first conclusion said
  "works". The owner rejected it: local mode must not depend on Cloudflare's
  toolchain, because running locally is the prerequisite.
- **Rule:** When reporting that something works, also check it against the
  principles the owner has stated (ADRs, invariants, recent decisions). A
  pass list is necessary, not sufficient.
- **Scope:** spikes, evaluations, "done" reports.
- **Evidence:** ADR 0018 supersedes 0004.

## L3 A check that cannot run here is not passed

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** This sandbox has no package registry, so Biome and
  `bun install` could not run locally. Two PRs (#167, #175) went red in CI on
  formatting: export order, and an array of objects that Biome expands.
- **Rule:** Say in the PR which checks could not run locally, and do not
  report the work as done until CI has passed. Known Biome behaviour: type
  exports sort before value exports; an array of two or more multi-key
  objects is printed one element per line; names sort letter by letter
  ignoring case, but at the same letter uppercase comes first (`runSteps`
  before `runs`); a chain of three or more calls breaks one call per line
  when an argument is not simple (`now() + x`), even if it would fit; Biome
  also formats YAML under `.github` (exactly one trailing newline).
- **Scope:** any session without a working `bun install`.
- **Evidence:** CI runs on #167, #175, #177 and #179.

## L2 Re-read the whole section after inserting into a list

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** In #175 a new block was inserted into the architecture
  list in `CLAUDE.md` above its last item, which moved `apps/local` under
  the wrong heading.
- **Rule:** After editing a list or a table in a document, read the whole
  section again before committing.
- **Scope:** Markdown docs, especially `CLAUDE.md` and ADRs.
- **Evidence:** fixed in #175.

## L1 A module and its package entry never import each other

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** In #167, `packages/contracts/src/read.ts` imported from
  `index.ts` while `index.ts` re-exported `read.ts`. The ES module cycle
  would have read `LanguageSchema` before it was defined.
- **Rule:** A module that the package entry reaches at run time never
  imports the entry back. Shared definitions live in their own module that
  both sides import. Tests and `import type` may import the entry.
- **Scope:** `packages/*/src` and `apps/*/src`.
- **Check:** `selfImports` in `scripts/check-deps.ts` enforces it.
