# Lessons

Mistakes made while building Breaker Delta, kept so they are not repeated.
How to add, scope and retire entries: `docs/development.md`. Newest first.
Each rule applies only within its scope.

## L22 A comment's "never" or "no X when Y" needs the test for Y

- **Date:** 2026-11-24. **Status:** active.
- **What happened:** #238's changes step said a wave "back up after being
  flat has no change yet". The code only looks at the point 24 hours back,
  so a wave that was up then, flat in between and up now is measured, and
  can be written as rising. The PR's own test showed that case and was named
  for something else. Review round 1 blocked on it.
- **Rule:** When a doc comment or a PR says when a rule does not fire, write
  the test for that exact case, or remove the claim.
- **Scope:** header comments of `apps/pipeline/src/core` steps and
  `packages/core` rules, and PR descriptions.
- **Evidence:** review rounds 1 and 2 on #238; fixed in ff46719.

## L21 A time bound must be read after the writes it is meant to include

- **Date:** 2026-11-23. **Status:** active.
- **What happened:** #233's review asked the height trial to score "as of
  `--now`", and the fix bounded the query by `first_seen_at <= now`. With
  no `--now`, the script read the clock before `--collect` fetched, so the
  owner's first run stored 5,502 echoes, all stamped a few milliseconds
  after "now", and showed 0. The test seeded rows with fixed times, so it
  never ran collect and query in one command. The owner caught it.
- **Rule:** When adding a time bound, check where its clock is read
  against every write the same command makes before the query, and test
  the whole command with a stand-in for those writes, not only the query.
- **Scope:** scripts and steps that write and then read by time
  (`scripts/`, `apps/pipeline/src/core`).
- **Check:** the test "with --collect and no --now, echoes just collected
  are scored" in `scripts/height-trial.test.ts` (fails with the clock read
  before collect). Fixed in #234.

## L21 Before writing a field an invariant names, find the step the invariant ties it to

- **Date:** 2026-11-24. **Status:** active.
- **What happened:** #237's compute step set `topics.formed_at`, the "wave
  forming" that invariant 5 says is written in the same batch as the
  prediction. The prediction comes from the model in a later step (#34), so
  the two could never share a batch, and the PR did not say so. Review
  round 1 blocked it; the owner then decided which write counts (#237,
  2026-11-24). The same round found three filters no test exercised.
- **Rule:** When a step writes a column or a row that an invariant or the
  schema docs name, search for every place that names it and check that the
  step's batch can hold what the invariant pairs it with. If not, it is a
  deviation to raise before building (L5).
- **Scope:** `apps/pipeline/src/core` steps, invariants 1, 4 and 5.
- **Evidence:** review comments on #237 (rounds 1 and 2).

## L20 Check what a field means in a recorded response, not only that it is there

- **Date:** 2026-11-23. **Status:** active.
- **What happened:** #220 dated Daily Papers by the entry's `publishedAt`,
  taken to be the day a paper was featured. It is the arXiv date; the
  featured day is `paper.submittedOnDailyAt`. The fixture had a date on all
  five items, so the check "every item has a date" passed, while all five
  were featured on the recording day and dated 4 to 13 days earlier. The
  review found it by comparing the two fields in the fixture.
- **Rule:** When an adapter picks one of several candidate fields (dates,
  counts, URLs), compare their values in the recorded fixture against what
  the item should mean, and pin the chosen one with a test where they differ.
- **Scope:** `apps/pipeline/src/sources/adapters`.
- **Evidence:** fixed in #220; the Daily Papers test in
  `json-adapters.test.ts` has an entry whose arXiv and featured dates differ.

## L19 A drift check compares values, not that a value is there

- **Date:** 2026-11-23. **Status:** active.
- **What happened:** #208's schema test compared each index's "is partial"
  flag but not its WHERE, so a migration index that guarded the wrong event
  type passed it. The schema also typed enums and a version rule that SQL
  never checked, so a raw write could break them. The review found both with
  throwaway edits.
- **Rule:** When a check compares two descriptions of one thing (schema and
  migration, config and docs), compare every property's value, rendered the
  same way on both sides. A rule only one side types (an enum, "published
  has a version") also goes in the side that stores the data.
- **Scope:** `apps/pipeline/test/schema.test.ts`, migrations, any
  two-sided consistency check.
- **Check:** `schema.test.ts` compares WHERE and CHECK text and plants a
  changed one of each.

## L18 Check a token against every call the workflow makes, not the first one

- **Date:** 2026-11-23. **Status:** active.
- **What happened:** after #200 (issue #11), the owner set up the preview
  token as it documented, with Workers Scripts Edit, and Previews were
  created with it from #199 on. The `cleanup`
  job, which runs only when a PR closes, deletes the Preview, and Edit
  cannot delete. It failed with "No access to the specified resource" on
  #199 and #201 to #206, and those Previews stayed. The delete loop stops
  at its first failure, so `bd-web`'s Preview was never even tried. Nobody
  saw it, because the job runs after the merge, when no one looks at the
  checks.
- **Rule:** When choosing a token's permissions, list every API call the
  workflow makes (create, update, delete), and run each one once before
  calling the setup done. A job that runs after a merge has its result
  checked once, on the first PR that triggers it.
- **Scope:** `.github/workflows/*.yml` and the tokens in their
  environments; `scripts/cf.sh` scopes.
- **Evidence:** `cleanup/Delete previews` in `preview.yml` runs
  45036876471 (#199), 45037076175, 45037966166, 45038505176, 45040923078,
  45075447737 and 45080746473 (#206). Fixed by the owner on 2026-11-23; the
  rerun of 45080746473 then deleted `pr-206` for both Workers.

## L17 Test a parser with the escapes and neighbours real documents use

- **Date:** 2026-11-23. **Status:** active.
- **What happened:** #206 read feeds with fast-xml-parser but tested only
  `&amp;` and `&lt;`. In 5.11.2 numeric character references (`&#8217;`,
  which WordPress writes for apostrophes) are decoded only with
  `htmlEntities` on, so titles kept them raw. `removeNSPrefix` also let
  `<atom:link>` and `<media:title>` replace the RSS elements. The review
  found both with throwaway inputs.
- **Rule:** When configuring a parser for a standard format, test each
  option against the forms real documents use: every escape kind, and
  elements from other namespaces next to the ones read. It extends L14.
- **Scope:** `apps/pipeline/src/sources` and any code that reads XML,
  HTML or feeds.
- **Evidence:** fixed in #206, tests in `parse.test.ts`.

## L16 Write down who decided each value

- **Date:** 2026-11-23. **Status:** active.
- **What happened:** #202 recorded the owner's choice of three providers,
  then wrote a chain that included a fourth (OpenRouter) and said the chains
  were "chosen by the owner". `docs/settings.md` said every default was the
  owner's, including one the agent had only proposed and others nobody had
  reviewed. The PR description said so; the docs did not. The review caught
  it. It is L5 again, in documents instead of code.
- **Rule:** In a decision record, mark every value as the owner's decision
  (with the date), the agent's proposal, or inherited and unreviewed. Never
  widen an owner's decision when writing it down. A PR closes a decision
  issue only when every value in it is the owner's.
- **Scope:** ADRs, `docs/*.md` decision records, settings defaults, issue
  updates.
- **Evidence:** fixed in #202 (`docs/settings.md` "Decided" column).

## L15 A red job is red even when it is not required

- **Date:** 2026-11-22. **Status:** active.
- **What happened:** #198 put inline styles in every page's `<head>`. The
  verify-local selftest in `spike-local.yml` looks for the front page's
  edition line in what `verify-local get` prints, which was the first 2000
  characters, now all `<head>`. The `local` job went red on #198 and on
  every PR after it, but it is not a required check, so #198 merged and the
  failure surfaced on #200.
- **Rule:** Before calling a PR done, read every failed job, not only the
  required ones. A failure that predates the PR is named in its report with
  the first run that failed.
- **Scope:** every PR, `take-case` and `docket` reports (`/next` and `/run` when written).
- **Evidence:** fixed in this PR; `verify-local get` now prints from `<body>`.

## L14 Read a standard format with its parser, and check names against the runtime's own

- **Date:** 2026-11-22. **Status:** active.
- **What happened:** #199 checked skill frontmatter with a regex. The review
  showed it passed files a YAML parser rejects (`description: Use when: x`,
  `description: ""`, a list), which Pi then drops. It also showed that a
  project skill named `run` with `disable-model-invocation` made Claude
  Code list its own bundled `run` skill to the model instead. Reading a
  format with hand-written rules repeats L11. It happened again in #211:
  the relative-import check read TypeScript with a regex, and two review
  rounds found forms it missed (`./x.bun` for `x.bun.ts`, `./x.js`,
  `import(p, { with })`, template `require`, symlinks). The third round
  showed Bun's parser itself reading differently from the build: it drops
  `import { type X } from`, which `verbatimModuleSyntax` keeps, and its tsx
  loader rejects `.ts` generics.
- **Rule:** When a check reads YAML, JSON, source code or another standard
  format, use the parser the consumers use, and test it with inputs that
  parser rejects or reads differently. Before naming a skill or command, check the name against what
  each runtime already ships.
- **Scope:** checks and scripts that read config, frontmatter or source
  code; names of skills (since 2026-11-24 they come from the `onus`
  plugin, not `.claude/skills/`).
- **Check:** `scripts/agent-files.ts` parses frontmatter with `Bun.YAML` and
  refuses the reserved name `run`; `scripts/agent-files.test.ts` covers
  both. `scripts/check-deps.ts` reads relative imports with
  `Bun.Transpiler.scanImports` and resolves them with `Bun.resolveSync`.

## L13 Check a credential's shape, not only its characters

- **Date:** 2026-11-22. **Status:** active.
- **What happened:** During #10 an account API token was stored in the
  keychain item for the account ID. `scripts/cf.sh` only checked that the
  value used token-safe characters, so it passed it to wrangler, which put
  it in request URLs and printed them in its error output. The token
  reached the chat and wrangler's log files and had to be revoked. A later
  attempt swapped the two values the same way.
- **Rule:** When a wrapper loads several secrets or identifiers, check each
  one against its exact format (length, alphabet), and reject a value that
  has another slot's format. Assume a tool's error output prints any value
  it puts in a URL.
- **Scope:** `scripts/cf.sh` and any wrapper that loads credentials for a
  CLI.
- **Check:** `scripts/cf.test.ts` refuses a token as the account ID (alone
  or swapped with the ID), a wrong-length or upper-case ID, and an account
  ID in the token slot, and asserts the refusal does not echo the value.

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
- **Scope:** Markdown docs, especially `AGENTS.md` and ADRs.
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
