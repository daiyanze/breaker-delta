# Lessons

Mistakes made while building Breaker Delta, kept so they are not repeated.
How to add, scope and retire entries: `docs/development.md`. Newest first.
Each rule applies only within its scope.

## L12 A missing credential must fail, not fall back

- **Date:** 2026-11-22. **Status:** active.
- **What happened:** #188 first told sessions to
  `export CLOUDFLARE_API_TOKEN="$(security find-generic-password ...)"`.
  When the lookup fails, `export` hides its exit status and leaves the value
  empty, and exported variables do not carry over between an agent's shell
  calls. Wrangler then uses the
  owner's stored login, which ADR 0019 forbids. The review found this by
  reading wrangler's auth code.
- **Rule:** Load a credential in the same command that uses it, through one
  wrapper that stops on an empty value. Check which identity a tool falls
  back to when the credential is missing.
- **Scope:** any CLI that has a stored login next to a token variable
  (wrangler, gh, cloud CLIs).
- **Check:** `scripts/cf.sh`, tested by `scripts/cf.test.ts` in `check`.

## L11 Survey the real inputs before writing rules that read them

- **Date:** 2026-11-22. **Status:** active.
- **What happened:** #186 wrote `/next`'s "Depends on" rules for `#n` and
  `M0-03` only. The issues also use bare milestones, milestone ranges and
  code ranges; read literally, the rules would have started #17 while its
  dependency `M0` was open. The review caught it by applying the rules to
  every issue.
- **Rule:** Before writing a parser, a check or written rules that read
  existing data (issues, files, settings), list every distinct form in the
  real data and cover each one. A form that is not covered fails loudly.
- **Scope:** scripts, checks and agent commands that read repository or
  GitHub data.
- **Evidence:** fixed in #186.

## L10 In a `bash -e` step, a false test in a command substitution ends the step

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** In #182, `exe="...$([ "$RUNNER_OS" = Windows ] && echo .exe)"`
  ended the GitHub Actions step on Linux and macOS with exit 1 and no
  output. An assignment's status is its last command substitution's, and
  Actions runs bash with `-e`. The same expression used as a command's
  argument or as an env prefix did not fail, which hid it.
- **Rule:** In workflow `run:` blocks, branch with `if ...; then ...; fi`,
  never with `cond && echo` inside an assignment.
- **Scope:** `.github/workflows/*.yml` and shell scripts run with `-e`.
- **Evidence:** fixed in #182.

## L9 Test the thing a user gets, not the thing CI built

- **Date:** 2026-11-21. **Status:** active.
- **What happened:** #182 ran the spike against the executable on the
  runner that built it, then uploaded it. `upload-artifact` zips files and
  drops the executable bit, so the download would not have run on Linux or
  macOS without `chmod`. The review caught it from the action's docs.
- **Rule:** When a criterion is about what a user receives (a download, a
  package, a deployed page), check the delivered form on a fresh machine,
  not the build output in place.
- **Scope:** Release artifacts, packages, deploys.
- **Check:** the `downloaded` job in `spike-local.yml`.

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
