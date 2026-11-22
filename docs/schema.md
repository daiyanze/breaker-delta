# Content database schema

The tables of the content database, one section per table. The drizzle
definitions are in `packages/db/src/schema.ts`, the SQL in
`packages/db/migrations`; `apps/pipeline/test/schema.test.ts` fails when the
two differ. Only `apps/pipeline` writes these tables (invariant 7).

**Who decided it.** Issue #17 asks for the schema to match "the design
document", which is not in the repository. On 2026-11-23 the owner chose to
derive the tables from the ADRs, the read and desk contracts and the M1 to M4
issues. Every M1 table and column below is therefore the agent's proposal
(#17), for the owner to review in the PR; the M0 tables are from #171 and
earlier and unchanged.

Conventions: times are epoch milliseconds; ids are text made by the pipeline
(the two audit tables count up); a slot is the run id from `slotId` in
`@bd/core`. There are no foreign keys: D1 enforces them and local SQLite does
not by default, and both runtimes must behave the same. JSON columns hold ids,
numbers and short codes, never fetched text.

## Derived, not stored

These read-model fields are computed from the tables, so no column holds
them: a topic's current height and rank (its latest `wave_points` row), its
source headline (its first echo's title), its model headline (the latest
published summary's title), an echo's origin or pickup role (whether its
group was the topic's first), and a clipping's "merged from" (the
`topic_edits` row that moved it).

## M0 tables

`settings`, `settings_history`, `source_groups`, `runs`, `run_steps`,
`scan_results`: see the comments in `schema.ts`.

## echoes

One item on one source, identified by its normalised URL (`url` is unique).
`title` and `excerpt` are the source's own text; `lang` is its BCP 47
language, `und` until known. `first_slot` is the run that found it.
`topic_id` is null until assign places it, so an echo whose assignment
failed is picked up again next run (#32).

## echo_metrics

The heat a source reported for an echo at one run; key `(echo_id, slot)`.
Ingest adds a row for a known echo instead of a new echo (#27); there is one row per echo per run.

## topics

A set of echoes. `slug` is unique and stable. `name` is the assign model's
proposal, used for the shortlist and never shown. `state` is `echo` (not a
wave yet), `up` or `flat`, the same words as the read contracts and ADR 0014;
`formed_at` and `went_flat_at` are set by code (#29). A merged topic keeps
its row with `merged_into` and `merged_at`, so its slug redirects (#77).

## topic_aliases

Other names a topic is known by, for the assign shortlist (#32).

## topic_edits

The audit trail of topic corrections: `merge`, `split`, `rename`,
`reassign` (#77). A merge or a split writes one row per echo it moves.
`editor` is the desk editor's id or `pipeline`.

## wave_points

A topic's `state`, `height`, `rank` (null when not up), source count and
echo count at one run, computed by `@bd/core`; key `(slot, topic_id)`. The
history chart, the newsstand's editions and the 24-hour change read it
(ADR 0015).

## summaries

One summary attempt. `status` is `published` or `discarded` (it failed
validation, #34; the topic page then says `failed_checks`). A published row
has a `version` unique per topic and is never edited (invariant 4); a
discarded one has none. `reason` is `formed`, `new_echoes` or `rewrite`,
worded per language by the site. `writer` is the provider name from
settings. `unverified` is the fact gate's label (ADR 0006, #47);
`source_text_read` is false when enrich could not fetch the sources (#45).
`risk_flags` is the model's flags as JSON.

## summary_texts

A summary's `title` and `body` in one language; key `(summary_id, lang)`.

## summary_evidence

The echoes a summary cites, by id (invariant 2); key `(summary_id, echo_id)`.

## events

The change feed, seven types (ADR 0014). Partial unique indexes make the
pipeline's writes idempotent: a topic has one `wave_formed` event, one
`wave_rising` or `went_flat` event per run, and one `summary_updated` event
per summary. `corrected`, `withdrawn` and `verdict` come from the desk and
may repeat. `summary_id`, `verdict_id` and `correction_id` point at the row
the event is about; `detail` is JSON written by code.

## predictions

The review criterion: one per topic, written in the same batch as the wave
forming, with the SHA-256 of its text (invariant 5, #34). `summary_id` is the
first summary, which proposed it. Never edited; it stays when its summary is
withdrawn (ADR 0006).

## verdicts

Only added (ADR 0013). `status` is `proposed` (by the model, with `writer`)
or `confirmed` (by a desk `editor`). A revision is a new row whose `revises`
names the earlier one. `evidence_ids` is the outside evidence it cites as
JSON; the evidence itself is stored by the review run (#79), not here.

## corrections

A correction or a withdrawal of one summary version (ADR 0006, #78).

## correction_texts

A correction's note to readers in one language; key `(correction_id, lang)`.

## Not in this schema

- Model-written short titles (`shortTitles` in the read contracts): the
  summarize contract has no such field yet (#44).
- Outside evidence for verdicts and the private tables (editors, subscribers):
  #79 and #18.
- Fetched page text for enrich and raw responses: blob storage (#45, #38).
