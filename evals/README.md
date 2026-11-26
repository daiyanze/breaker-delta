# Evals

How a prompt or model change is measured before it ships (#50). A PR that
changes a prompt, the judge package or the provider configuration must
include the eval result (`AGENTS.md`); the `evals` workflow posts it on the
PR. This directory is a protected path.

## Pieces

| Piece | Where |
| --- | --- |
| Prompts, one per task, each with a version | `PROMPTS` in `packages/judge/src/prompts.ts` |
| Committed cases, synthetic only | `evals/cases/assign/`, `evals/cases/summarize/` |
| Cases frozen from real runs, local only | `.bd-data/eval-cases/` (git-ignored) |
| The chains the eval calls | `evals/providers.json` |
| Case format | `scripts/eval-cases.ts` |
| Runner and metrics | `scripts/eval.ts` |
| Freezing cases from a run | `scripts/freeze-cases.ts` |
| Workflow | `.github/workflows/evals.yml` |

Assign ships `assign-v1` (#43, `packages/judge/src/assign-prompt.ts`) with
its cases in `evals/cases/assign/`, and summarize ships `summarize-v1` (#44,
`packages/judge/src/summarize-prompt.ts`) with its cases in
`evals/cases/summarize/`. `pipelineConfig` hands every prompt in `PROMPTS`
to the pipeline (`driverPrompts`), so an entry there is all the wiring a
prompt needs.

## Two kinds of case (owner, #253)

- **Synthetic, committed.** Written by hand, with no fetched text, marked
  `"synthetic": true`, in `evals/cases/`. CI runs these and posts the result.
- **Frozen from a real run, local only.** Made by `freeze-cases`, marked
  `"frozenFrom": "<slot>"`. They hold fetched titles and excerpts, which
  must never reach a session that can write code (invariant 6), and a
  review reads a PR's diff. So they live in a git-ignored folder on the
  owner's machine, and the owner runs them there.

What enforces it: `loadCases(..., { committed: true })` walks every file
under the folder, at any depth, refuses anything that is not a case at
`<task>/<id>.json` (a subfolder, another extension, a `.gitkeep`, a copied
`eval-cases/` folder), and refuses a frozen case. `eval.ts` uses it whenever
`--cases` is `evals/cases`, and the test "the committed cases" in
`scripts/eval-cases.test.ts` runs it in `check`. `freeze-cases` refuses an
output folder git would track, and fails closed: when git cannot run, or
answers anything but "ignored" or "in no repository", it does not write.

## Case format

One case is the input of one model call, exactly as the step builds it,
plus its origin. The file name is the case id.

```json
{
  "synthetic": true,
  "input": {
    "echoes": [{ "id": "e1", "title": "...", "summary": "..." }],
    "topics": [{ "id": "t1", "name": "...", "aliases": ["..."] }]
  },
  "labels": { "e1": "t1" }
}
```

A case has exactly one of `"synthetic": true` and `"frozenFrom"`. Biome
lints JSON, so run `bun run format` after writing a committed case. A
summarize case's `input` is `{ "name", "echoes", "languages", "first" }`
(`SummarizeInput`). A summarize echo may have `page`: the text of its page
that the enrich step read (#45), which the step gives the model apart from
the excerpt (`summary`). The eval passes it to the prompt as is, marks the
draft `sourceTextRead` when any echo has one, and checks addresses against
titles and excerpts only, as the validate step does. Assign echoes have no
`page`. `labels` (assign only) is the owner's own assignment for
some echoes: a shortlisted topic id or `new`, written by hand.

What the parser checks (`scripts/eval-cases.ts`):

- **Keys, every case:** a key the format does not name is refused, at any
  depth, so a case has no URL field, source name or other column.
- **Values, synthetic cases only:** a string that looks like a URL (a
  scheme or `www.`), an email address, or a key or token (`sk-...`,
  `gsk_...`, `AIza...`, `ghp_...`, `xox?-...`, `AKIA...`, `cfat_...`, a
  JWT, `Bearer ...`) is refused. These are patterns: a secret of another
  shape passes, so a synthetic case is still reviewed.
- Frozen cases' values are not checked: real titles hold URLs, and those
  cases never leave the owner's machine.

Errors name the file and the path, never the value.

## Freezing cases from a run (owner only)

```sh
bun scripts/freeze-cases.ts --slot <slot> [--data-dir .bd-data] [--out <dir>] [--task assign|summarize]
bun scripts/eval.ts --cases .bd-data/eval-cases
```

It reads the local-mode database without writing it and rebuilds what the
model was given in that slot: assign's batches with the shortlist from the
topics that existed when the run started, and one summarize case per topic
the slot summarised. A summary written with page text
(`summaries.source_text_read`) gets each echo's page from the slot's enrich
blob under `<data-dir>/blobs`, so the case is what the model saw. Retention
removes those blobs after `rawRetentionDays`: freeze such a slot before
then, since a summary whose pages are gone is skipped (and counted), never
frozen without them. Settings are the ones in force when the run started. A
case file that exists is kept, so a case is frozen once. It prints file
names and counts, never fetched text.

The output defaults to `<data-dir>/eval-cases`; a folder git would track
(`git check-ignore`) is refused, and so is any folder when git cannot run. Only the owner runs it on real data,
outside a coding session. Tests freeze from the scrubbed fixture sources
only (`scripts/freeze-cases.test.ts`).

Known gap: the assign step takes every echo still without a topic, and
freeze takes the echoes first seen in the slot. Echoes an earlier slot
could not place are left out, and batch boundaries can shift.

## Running

```sh
bun scripts/eval.ts [--cases evals/cases] [--report eval.md] [--json eval.json] [--min-contract 0.5]
```

Keys come from the environment by the names in `providers.json`
(`apiKeyRef`), as the pipeline reads them; a provider without its key is
left out.

**Contract floor.** An evaluated task whose contract rate (answers that fit
the contract, of its cases) is below `--min-contract` fails the run. The
default is 0.5, the owner's floor of 3/6, and it applies to every task.
Rounded up to whole cases: 6 cases need at least 3, and assign's 7 cases
need at least 4 (3/7 fails). The value is a plain decimal from 0 to 1;
anything else is refused with exit 2, as is a malformed command line (a
missing value, an unknown option, or `--min-contract -0.5`, which the
argument parser reads as an option). A task with no cases or no provider
key is reported as not evaluated, as before, and the floor does not apply
to it. The report says, per task below the floor, its count and the count
it needed (`contract 3/7 is below the floor of 0.5 (at least 4/7)`), and
the JSON holds the floor used (`minContract`). The floor is a flag of the
eval script, not a pipeline setting: the eval reads no `settings` table.

Exit 0 when every shipped prompt was evaluated and none is below the
contract floor; 1 when one has no cases or no provider with a key, or when
an evaluated task is below the floor; 2 on a bad case or providers file or
a bad `--min-contract`.

## Metrics

Automatic, per task. Each is printed as a count out of a total:

| Metric | assign | summarize |
| --- | --- | --- |
| contract | cases whose chain returned an answer that fits the contract | same |
| citations | echoes the step would place (`validateAssignments`), of all echoes | answers that cite only offered echoes, of answers |
| languages | - | answers with one text per language asked for, of answers |
| publishable | - | answers the validate step would publish (`validateDraft`), of answers |
| repaired | answers that needed the chain's one repair, of answers | same |
| fallback | answers from a provider other than the chain's first, of answers | same |
| agreement | labelled echoes placed as labelled, when cases have labels | - |

**Answered by**, per task: every provider of the chain, in chain order,
with the number of cases it answered (0 for one that answered none). For
each provider after the first, the report also lists the ids of those
cases; the JSON has the ids for every provider (`answeredBy`).

**Unanswered cases** (contract misses), per task, are listed by why the
chain's last provider failed, with the ids of the cases. A provider that
answered with an HTTP error status is shown by its exact status
(`http-503`, `http-429`); any other failure by its kind from the fixed list
in `packages/judge/src/index.ts` (`FAILURE_KINDS`):

| failure | the provider |
| --- | --- |
| `http-<status>` | answered that HTTP error status (`http-429` is a rate limit) |
| `timeout` | gave no response within the timeout |
| `network` | failed before any response |
| `empty` | answered with no completion text |
| `not-json` | answered, and after the one repair still not JSON |
| `schema` | answered JSON, and after the one repair still off the contract |
| `other` | failed some other way |

Then, for each unanswered case, why every provider the chain tried failed,
in chain order (`tried` in the JSON), for example
`` `k2` (gemini `http-503`, groq `http-429`, opencode-go `http-400`) ``.

HTTP statuses, `timeout`, `network` and `empty` are provider errors;
`not-json` and `schema` are the prompt's or the model's. Only the failure,
the provider name and the case id are kept: case ids are file names
(hand-written for committed cases, slot and topic id for frozen ones),
never fetched text.

The result (the report and the JSON) holds only: the commit SHA, task
names, counts and ratios (per-provider answer counts included), prompt
versions, provider and model names, failures (kinds and HTTP status
codes), case ids, and, when no provider has a key, the names (never the
values) of the key variables to set. A model answer can quote fetched text
and the comment is read by coding sessions, so no answer, case text or
chain error is printed.

Still by hand: spot checks of Chinese and Japanese readability.

## The workflow

`.github/workflows/evals.yml` runs the committed cases on PRs that change a
prompt, the judge, the eval or its cases, or the pipeline checks it scores
with. It runs only for the owner's same-repository PRs, in the `evals`
environment, and updates one comment on the PR (its bot's, found by a
marker). A shipped prompt it could not evaluate, or a task below the
contract floor, fails the job (the job runs the default floor).

The owner sets up once: in the GitHub environment `evals`, the secrets
`GROQ_API_KEY`, `GEMINI_API_KEY` and `OPENCODE_GO_API_KEY` (the keys in
`docs/providers.md`; one is enough, the chain skips a provider without its
key). No required reviewers.
The chains in `providers.json` are the agent's proposal (#50), not
reviewed: the hosted chains of `docs/providers.md` in the same order, without
Workers AI, whose base URL holds the account id. OpenCode Go is last in both
chains, as the eval's fallback only (owner's decision, 2026-11-26).
