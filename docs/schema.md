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
not by default, and both runtimes must behave the same. Enum columns carry
a named CHECK with the same values drizzle types them with. JSON columns hold ids,
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

The select step (#33) reads the `waiting` list from the latest earlier
slot whose `select` row in `run_steps` finished; a failed row is skipped.
Those waves go first in its order.

`scan_results` gets one row per fetch group the scan step tried in a slot
(#26): `ok` is false when the group is missing. A group that was not due,
or has no adapter yet, gets no row. The step reads a group's last good
scan from here to decide whether it is due. Its raw responses are a blob,
`raw/<slot>/<group id>.json` (`apps/pipeline/src/core/scan.ts`).

## echoes

One item on one source, identified by its normalised URL (`url` is unique).
`title` and `excerpt` are the source's own text; `lang` is its BCP 47
language, `und` until known. `first_slot` is the run that found it.
`topic_id` is null until assign places it, so an echo whose assignment
failed is picked up again next run (#32).
Ingest (#27) creates echoes: `id` is `e` and the first 24 hex digits of the
SHA-256 of `url`, so one URL always gets the same id, and the echo belongs to
the group that first listed the URL.
Retention (#38) removes an echo, with its `echo_metrics` rows, once no
sighting of it has been recorded for `echoRetentionDays`, unless its topic
was ever a wave, a summary cites it, or a topic edit names it
(`apps/pipeline/src/core/retention.ts`). Ingest records a sighting only when
the group that owns the echo lists it and its title passes the keyword
filters. An echo another group still lists is removed, and the next ingest
creates it again under whichever group lists it first. Nothing else is
removed with it.

## echo_metrics

The heat a source reported for an echo at one run; key `(echo_id, slot)`.
Ingest adds a row for a known echo instead of a new echo (#27); there is one row per echo per run.

## topics

A set of echoes. `slug` is unique and stable. `name` is the assign model's
proposal, used for the shortlist and never shown. `state` is `echo` (not a
wave yet), `up` or `flat`, the same words as the read contracts and ADR 0014;
`formed_at` and `went_flat_at` are set by the compute step (#29,
`nextTopicStatus` in `@bd/core`): a topic is `up` once its echoes come from
`waveThreshold` groups (unless all its echoes are older than `calmAfterDays`:
the step does not look at it then) and never an echo again; it goes `flat` when its latest
echo (or its forming, if later) is `calmAfterDays` old, and back `up` when its
latest echo is inside `calmAfterDays` again (a newer echo, or a longer
`calmAfterDays`), which clears `went_flat_at`. A merged topic keeps
its row with `merged_into` and `merged_at`, so its slug redirects (#77).

## topic_aliases

Other names a topic is known by, for the assign shortlist (#32).

## topic_edits

The audit trail of topic corrections: `merge`, `split`, `rename`,
`reassign` (#77). A merge or a split writes one row per echo it moves.
`editor` is the desk editor's id or `pipeline`.

## wave_points

A topic's `state`, `height`, `rank` (null when not up), source count and
echo count at one run, computed by `@bd/core` at the slot's start; key
`(slot, topic_id)`. The compute step (#29) writes one for each topic not
merged away that is up, has an echo first seen in the last
`calmAfterDays`, or already has a point in that slot; a flat wave's last
point is the one that turned it flat. The
history chart, the newsstand's editions and the 24-hour change read it
(ADR 0015).

## summaries

One summary attempt. `status` is `published` or `discarded` (it failed
validation, #34; the topic page then says `failed_checks`). A published row
has a `version` unique per topic and is never edited (invariant 4); a
discarded one has none (a CHECK holds both). `reason` is `formed`, `new_echoes` or `rewrite`,
worded per language by the site. `writer` is the provider name from
settings; `model` is that provider's model and `prompt_version` the
version of the summarize prompt it was sent (ADR 0005, #48), so a summary
can be traced to its origin. Both are null on rows written before #48, and
`prompt_version` is null while the prompt has no version (none ships yet,
#44). The commit step copies all three from the draft, for discarded rows
too. `unverified` is the fact gate's label (ADR 0006, #47);
`source_text_read` is false when enrich could not fetch the sources (#45).
`risk_flags` is the model's flags as JSON.
The select step (#33, `apps/pipeline/src/core/select.ts`) reads this table
to pick the waves due a summary: `formed` when a wave has no published row,
`new_echoes` when enough echoes are newer than its latest published row's
`slot`. No step writes `rewrite` yet.
The commit step (#34, `apps/pipeline/src/core/commit.ts`) writes it: a
published row gets the topic's next `version`, its texts and its evidence
in one batch; a draft the validate step refused (an echo id it was not
given, a missing language, a first summary with no criterion, an address
the echoes do not have) gets a discarded row and nothing else. A row's id
comes from its slot and topic, so a retried commit writes nothing twice.
`source_text_read` is true when the enrich step (#45,
`apps/pipeline/src/core/enrich.ts`) read at least one of the wave's
evidence pages and summarize gave it to the model; false when every fetch
failed, the run's page budget was spent, `enrichPagesPerTopic` is 0, or the
draft predates enrich. The
model's drafts are blobs, `raw/<slot>/summarize/<topic id>.json`, and
enrich's page texts are `raw/<slot>/enrich/<topic id>.json`, both removed
with the scan's raw responses after `rawRetentionDays`; the steps pass
topic ids only.

## summary_texts

A summary's `title` and `body` in one language; key `(summary_id, lang)`.

## summary_evidence

The echoes a summary cites, by id (invariant 2); key `(summary_id, echo_id)`.

## events

The change feed, seven types (ADR 0014). Partial unique indexes make the
pipeline's writes idempotent: a topic has one `wave_formed` event, one
`wave_rising` or `went_flat` event per run, and one `summary_updated` event
per summary. `corrected`, `withdrawn` and `verdict` come from the desk and
may repeat. A flat wave can rise and go flat again (#29), so the index
allows one `went_flat` per run, not one per topic.
The changes step (#30, `apps/pipeline/src/core/changes.ts`) writes
`wave_rising` and `went_flat` from `wave_points`, dated at the slot's start:
`went_flat` when a topic's point is `flat` after an `up` one, `wave_rising`
when its 24-hour change crosses `risingPercent24h` (`detail` is
`{ from, to, percent }`). `wave_formed` is the commit step's (#34), see
`predictions`.
`summary_id`, `verdict_id` and `correction_id` point at the row
the event is about; `detail` is JSON written by code.

## predictions

The review criterion: one per topic, written in the same batch as the wave
forming, with the SHA-256 of its text (invariant 5, #34). For invariant 5,
the wave forming is recorded by that batch: the first summary, its
`wave_formed` event and the prediction, written together by the commit step
(#34). The compute step sets `topics.state` and `formed_at` earlier, so the
board shows a wave whose summary is still queued (owner's decision,
2026-11-24, #237). `summary_id` is the
first summary, which proposed it. Never edited; it stays when its summary is
withdrawn (ADR 0006).
`lang` is the first of the languages the summary was asked to write. The
summarize call does not yet ask for the criterion in a given language, so
the criterion may be in another one; asking for it in `lang` is left to M2.
`registered_at` is the slot's start and
`due_at` is `reviewWindowDays` later. The commit step never writes a version 1
without this row: both, and the `wave_formed` event, are one batch.

## verdicts

Only added (ADR 0013). `status` is `proposed` (by the model, with `writer`)
or `confirmed` (by a desk `editor`). A revision is a new row whose `revises`
names the earlier one. `evidence_ids` is the outside evidence it cites as
JSON; the evidence itself is stored by the review run (#79), not here.

## corrections

A correction or a withdrawal of one summary version (ADR 0006, #78).

## correction_texts

A correction's note to readers in one language; key `(correction_id, lang)`.

## model_calls

One HTTP call a model step (assign or summarize) made in a run (#48): `slot`,
`task`, the `provider` name from settings, its `model`, the
`prompt_version` (null while unversioned), and `outcome`: `ok` (a valid
answer), `invalid` (an answer that failed the contract, repaired or not) or
`error` (no answer: transport, HTTP or empty completion). `fallback` is true
when an earlier provider of the same chain call had failed, so a run's
provider fallbacks are the rows with it set. `prompt_tokens`,
`completion_tokens` and `total_tokens` come from the response's `usage`, each
null when the response did not give it. `at` is when the step recorded it.
A failed chain call's calls are recorded too, and a retried step attempt's
calls are new rows: each was a real call. The row holds no key, no message
and no error text (`apps/pipeline/src/core/usage.ts`). The fake driver
records one `ok` call per answer with no tokens.
Totals per day group by the slot's day, UTC (`usageByDay` in `usage.ts`);
tokens are summed over the calls that reported them. Nothing removes these
rows yet.

## Not in this schema

- Model-written short titles (`shortTitles` in the read contracts): the
  summarize contract has no such field yet (#44).
- Outside evidence for verdicts (#79), and editors (desk sign-in, #74).
- Subscriber data: the private database, below.
- Fetched page text for enrich (#45, `raw/<slot>/enrich/`) and raw
  responses (#26), both removed by retention (#38): blob storage.

# Private database schema

`bd-private` holds the mailing list and what was sent to it (ADR 0012), and
nothing else; ADR 0019 keeps its rows out of the agent's session. The
drizzle definitions are in `packages/private-db/src/schema.ts`, the SQL in
`packages/private-db/migrations`, and the same test compares the two. It is
its own package so content-database code cannot name these tables: no
`scripts/check-deps.ts` rule for content code allows `@bd/private-db`, and
nothing allows it yet. The code that sends mail (#81, #82, #83) gets the
first rule that does, and binds the database on both runtimes.

**Who decided it.** The tables and columns are the agent's proposal (#18),
taken from the issue, ADR 0012, the desk mail contract (`DeskMail` in
`packages/contracts/src/desk.ts`) and #156, #157 and #81, for the owner to
review in the PR. The conventions are the content database's.

## subscribers

One address on the list; `email` is unique and stored normalised by the
code that adds it. `lang` is the email language; `edition` is `morning` or
`weekly` (the `MailKind` names). "None" is not an edition: it is
`status = 'unsubscribed'`. `status` is `pending` until the confirmation link
is opened. `added_via` is `form` or `desk`; `added_by` names the editor and
is set exactly for `desk` (a CHECK). `bounces_in_a_row` counts bounces since
the last delivery that did not bounce; `stopped_at` is set when sending
stops after three in a row (#157) and is null while mail still goes out.
Confirmation and preference tokens come with the subscription flow (#81).

## sends

One email sent to the list. `kind` is a `MailKind`. The two editions carry
`edition_key`, the edition's day in the site's time zone, and a partial
unique index sends each edition once; hand-written emails have none (a
CHECK). `subject` is a hand-written email's; `status` is `sending`, `sent`
or `held` (a held edition is skipped and kept as a row, #156). `created_by`
is the editor, when there is one.

## deliveries

One send to one subscriber, keyed `(send_id, subscriber_id)`, so the same
send can never reach a person twice (#157). `status` goes from `queued` to
`sent`, then `delivered` or `bounced`, or `failed` when the transport
refused it; `attempts` counts tries. `error` is the transport's short
message, never the address. A deleted subscriber's rows keep their counts
for Recent sends; the id they hold no longer leads to an address.
