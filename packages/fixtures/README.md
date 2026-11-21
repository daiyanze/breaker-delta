# @bd/fixtures

Fixture data behind the read contracts (`@bd/contracts`, `read.ts` and
`desk.ts`), a query layer that serves it, and the contract checks every
query layer must pass. See ADR 0017 and issue #162.

## Sets

| Set | What it is |
| --- | --- |
| `busy` | Nov 19, 14:00 JST, hourly runs, English, Chinese and Japanese. 16 waves up, verdicts in, a revised verdict, a merged topic, flat topics, all five summary states, a late and a failing source, all seven change types. |
| `quiet` | Same hour, 30-minute runs, English only. Two waves, no verdict yet, mail off. |
| `fresh` | A fresh install before its first scan. No summary writer, no mail. |

Each set has one JSON file per read model in `sets/<set>/`. Files that hold
many values (`editions`, `topics`, `source-details`, `search`,
`share-cards`, `edition-lists`) are maps keyed by slot, slug, group id,
query, card key (`topic:<slug>:<lang>`, `site:<card>:<lang>`) or day.

All data is sample data from the design boards. Sources use the launch group
ids; URLs are on `.example` hosts.

## Use

```ts
import { createFixtureReadQueries } from "@bd/fixtures";

const q = createFixtureReadQueries("quiet");
const edition = await q.edition();
```

`apps/web` renders a bare front page from fixtures when `READ_SOURCE` is
`fixtures`:

```sh
cd apps/web && bun run dev -- --var READ_SOURCE:fixtures
# then open /?set=quiet or /?lang=ja
```

## Contract checks

`@bd/fixtures/contract` exports `readContractChecks(queries, probes)` and
`deskContractChecks(queries)`. `contract.test.ts` runs them on every set,
validates every file, and checks the cases from #162. The database query
layer (#57) and `/api/v1` (#68) run the same checks.

When a contract changes, update the JSON in the same PR. A fixture must parse
to exactly itself: no field outside the contract.
