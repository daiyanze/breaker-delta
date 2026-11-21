# Lessons

Mistakes made while building Breaker Delta, kept so they are not repeated.
How to add, scope and retire entries: `docs/development.md`. Newest first.
Each rule applies only within its scope.

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
  objects is printed one element per line.
- **Scope:** any session without a working `bun install`.
- **Evidence:** CI runs on #167 and #175.

## L2 Re-read the whole section after inserting into a list

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** In #175 a new block was inserted into the architecture
  list in `CLAUDE.md` above its last item, which moved `apps/local` under
  the wrong heading.
- **Rule:** After editing a list or a table in a document, read the whole
  section again before committing.
- **Scope:** Markdown docs, especially `CLAUDE.md` and ADRs.
- **Evidence:** fixed in #175.

## L1 Never import your own package entry

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** In #167, `packages/contracts/src/read.ts` imported from
  `index.ts` while `index.ts` re-exported `read.ts`. The ES module cycle
  would have read `LanguageSchema` before it was defined.
- **Rule:** A module never imports its own package's `index.ts`. Shared
  definitions live in their own module that both sides import.
- **Scope:** `packages/*/src` and `apps/*/src`.
- **Check:** `selfImports` in `scripts/check-deps.ts` enforces it.
