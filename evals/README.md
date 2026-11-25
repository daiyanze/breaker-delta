# Evals

How a prompt or model change is measured before it ships (#50). A PR that
changes a prompt, the judge package or the provider configuration must
include the eval result (`AGENTS.md`); the `evals` workflow posts it on the
PR. This directory is a protected path.

## Pieces

| Piece | Where |
| --- | --- |
| Prompts, one per task, each with a version | `PROMPTS` in `packages/judge/src/prompts.ts` |
| Cases, one JSON file each | `evals/cases/assign/`, `evals/cases/summarize/` |
| The chains the eval calls | `evals/providers.json` |
| Case format | `scripts/eval-cases.ts` |
| Runner and metrics | `scripts/eval.ts` |
| Freezing cases from a run | `scripts/freeze-cases.ts` |
| Workflow | `.github/workflows/evals.yml` |

No prompt ships yet: #43 (assign) and #44 (summarize) each add a prompt
file, its entry in `PROMPTS`, and its cases. Wiring the prompts into the
pipeline's `PipelineConfig.prompts` is theirs too.

## Case format

One case is the input of one model call, exactly as the step builds it,
plus where it came from. The file name is the case id.

```json
{
  "frozenFrom": "20261120T0500",
  "input": {
    "echoes": [{ "id": "e1", "title": "...", "summary": "..." }],
    "topics": [{ "id": "t1", "name": "...", "aliases": ["..."] }]
  },
  "labels": { "e1": "t1" }
}
```

A summarize case's `input` is `{ "name", "echoes", "languages", "first" }`
(`SummarizeInput`). `labels` (assign only) is the owner's own assignment for
some echoes: a shortlisted topic id or `new`. It is written by hand.

The parser refuses any key the format does not name, at any depth. So a
case holds only what the model sees: echo ids, titles and excerpts, topic
ids, names and aliases. Never a URL, a source name, a secret or subscriber
data.

## Freezing cases from a run

```sh
bun scripts/freeze-cases.ts --slot <slot> [--data-dir .bd-data] [--out evals/cases] [--task assign|summarize]
```

It reads the local-mode database without writing it and rebuilds what the
model was given in that slot: assign's batches with the shortlist from the
topics that existed when the run started, and one summarize case per topic
the slot summarised. Settings are the ones in force when the run started. A
case file that exists is kept, so a case is frozen once. It prints file
names and counts, never fetched text.

Cases from a real run hold fetched titles and excerpts. They are data
(invariant 6): the owner freezes and reviews them outside a coding session,
and an agent working here does not open them. Tests freeze from the
scrubbed fixture sources only (`scripts/freeze-cases.test.ts`).

## Running

```sh
bun scripts/eval.ts [--report eval.md] [--json eval.json]
```

Keys come from the environment by the names in `providers.json`
(`apiKeyRef`), as the pipeline reads them; a provider without its key is
left out. Exit 0 when every shipped prompt was evaluated, 1 when one has no
cases or no provider with a key, 2 on a bad case or providers file.

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

The result holds numbers, prompt versions and provider names only. A model
answer can quote fetched text and the comment is read by coding sessions,
so no answer, case text or chain error is printed.

Still by hand: spot checks of Chinese and Japanese readability.

## The workflow

`.github/workflows/evals.yml` runs on PRs that change a prompt, the judge,
the eval or its cases, or the pipeline checks it scores with. It runs only
for the owner's same-repository PRs, in the `evals` environment, and
updates one comment on the PR. A shipped prompt it could not evaluate fails
the job.

The owner sets up once: in the GitHub environment `evals`, the secrets
`GROQ_API_KEY` and `GEMINI_API_KEY` (the keys in `docs/providers.md`; one is
enough, the chain skips a provider without its key). No required reviewers.
The chains in `providers.json` are the agent's proposal (#50), not
reviewed: the hosted chains of `docs/providers.md` in the same order, without
Workers AI, whose base URL holds the account id.
