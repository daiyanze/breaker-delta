# Settings defaults

What each setting starts as, and why (#16). The values live in
`SettingsSchema` in `packages/contracts/src/model.ts` (invariant 9, ADR
0008). A setting can be changed in the database without a release; this
page is only about where a new installation starts.

The "Decided" column says who set each value and when. On 2026-11-23 the
owner confirmed every value that had come with the scaffold, and the
agent's proposal for `summariesPerRun`.

| Setting | Default | Decided | Why |
| --- | --- | --- | --- |
| `runIntervalMinutes` | 60 | owner, 2026-11-23 | Hourly runs. The timer fires every 15 minutes and only checks whether a run is due. |
| `waveThreshold` | 3 | owner, 2026-11-22 | With 20 source groups, two groups agreeing (say, Hacker News and Lobsters) is common. Three groups is a clearer signal. |
| `halfLifeHours` | 24 | owner, 2026-11-22 | The site is read as one edition a day, so an echo's weight halves over a day. |
| `heightScale` | 10 | inherited, unreviewed | Multiplies the whole wave height. 10 is the coefficient the scaffold's formula had hard-coded; moved to settings unchanged (#28). |
| `sourceBonus` | 0.5 | inherited, unreviewed | Each independent source after the first adds this much to the height's multiplier: `1 + sourceBonus * (sources - 1)`. 0.5 is the scaffold's hard-coded value (#28). |
| `maxEchoesPerGroup` | 0 | agent's proposal (#28), not reviewed | Per fetch group, only this many of its highest echo scores count toward the height; 0 counts all, which is the scaffold's formula. Stops one busy group adding up on its own. The owner picks a value with `height-trial`. |
| `heatNormalisation` | none | agent's proposal (#28), not reviewed | `none`: heat in each source's own units (HN points, GitHub stars...), the scaffold's formula. `group`: each echo's heat is divided by its group's reference heat first. |
| `heatReferencePercentile` | 90 | agent's proposal (#28), not reviewed | Under `group`, a group's reference heat is this percentile (nearest rank) of its recent echoes' heat (`groupHeatReferences` in `packages/core`). Unused under `none`. The compute step takes "recent" as echoes first seen in the last `calmAfterDays` (agent's proposal, #29, not reviewed). |
| `calmAfterDays` | 7 | owner, 2026-11-23 | |
| `risingPercent24h` | 50 | owner, 2026-11-23 | The changes step (#30) writes `wave_rising` when a wave's 24-hour height change reaches this many percent and did not at the previous run (`crossedRising` in `packages/core`). The change is measured from the topic's latest point at or before 24 hours earlier, only when that point was up. The crossing and the base are the agent's proposal (#30), not reviewed. |
| `rewriteAfterNewEchoes` | 5 | owner, 2026-11-23 | The select step (#33) picks a summarised wave for a new version (`new_echoes`) once this many of its echoes were first seen in a slot after its latest published summary (`summaryDue` in `packages/core`). Counting by the echo's first slot is the agent's proposal (#33), not reviewed. |
| `summariesPerRun` | 3 | owner, 2026-11-23 | 72 summaries a day at hourly runs. No single free tier covers that together with assign; the three together likely do, but it is not measured (`docs/providers.md`, "Budget"). Proposed by the agent, confirmed by the owner. The select step (#33) takes first the waves the previous run left waiting, in that run's order, then the rest by height, so a wave over budget goes ahead of every wave that was not waiting (`selectForSummary`): it is taken in the next run unless more waves wait than the budget, and then the backlog drains in the order it built up. A wave whose attempt was discarded was not waiting, so it goes with the rest by height. That order is the agent's proposal (#33), not reviewed. |
| `reviewWindowDays` | 14 | owner, 2026-11-23 | |
| `languages` | en, zh, ja | owner, 2026-11-23 | |
| `keywordsInclude`, `keywordsExclude` | empty | owner, 2026-11-23 | |
| `assignProviders`, `summarizeProviders` | empty | ADR 0005 | No provider is built in (ADR 0005). An installation is set up with the chains in `docs/providers.md`. |
| `feedLimit` | 100 | owner, 2026-11-23 | |
| `timeZone` | Asia/Tokyo | owner, 2026-11-21 | The site's time zone: day boundaries, labels and the mail send time. |
| `mailSendTime` | 08:00 | owner, 2026-11-21 | The edition mail goes out at one time of day in `timeZone`, to everyone at the same moment (#156, #157). |
| `stepMaxAttempts` | 3 | owner, 2026-11-23 | |
| `runLeaseMinutes` | 30 | owner, 2026-11-23 | |
| `fetchTimeoutSeconds` | 20 | agent's proposal (#26), not reviewed | Per attempt for one source URL in the scan step, body included; also the one attempt per page in the enrich step (#45). Long enough for a slow feed, short enough that a dead one does not hold the run. |
| `fetchRetries` | 2 | agent's proposal (#26), not reviewed | Retries for network errors, 429 and 5xx only (`fetchSource`). Spike 2 saw intermittent 503s from `google_news`. |
| `fetchRetryDelaySeconds` | 2 | agent's proposal (#26), not reviewed | Doubled before each next retry: 2 s, then 4 s. |
| `assignBatchSize` | 20 | agent's proposal (#32, kept with the `assign-v1` prompt in #43), not reviewed | New echoes per assign model call. Small enough that one bad answer leaves few echoes for the next run, large enough that a busy hour takes a handful of calls. With `assign-v1`, the 20-echo, 30-topic eval case (`evals/cases/assign/full-batch.json`) is about 5,100 characters of prompt (roughly 1,500 tokens). The largest batch of plain text (every title 500, every excerpt 2,000 and every topic name 120 characters, 26-character ids) is about 57,800 characters, roughly 14,000 tokens: more than Groq's 8,000 tokens a minute, so Groq refuses such a call and the chain moves on (`docs/providers.md`). The prompt writes each `<`, `>` and `&` as a six-character JSON escape, so the same batch made only of those characters is about 325,800 characters, which can exceed every provider's context; its echoes then wait without a topic. |
| `assignShortlistSize` | 30 | agent's proposal (#32, kept in #43), not reviewed | Existing topics offered per call, ranked by words shared with the batch's titles, then by latest activity. Per call, not per echo as #43's summary words it: the echoes of one call share one list, so a per-echo cap of the same size would multiply the topics sent (up to 20 times 30) with mostly repeated names. The cost is that a busy batch can crowd out a topic only one of its echoes matches; that echo then starts a new topic. In the full-batch eval case, 30 topics are about 1,700 characters of prompt, as much as its 20 echoes: enough room for every topic a batch of 20 is likely to touch while the prompt stays short. |
| `assignActivityDays` | 7 | agent's proposal (#32), not reviewed | A topic whose latest activity (the later of its latest echo and its creation) is older is not offered; a returning story starts a new topic. Same as `calmAfterDays`. |
| `echoRetentionDays` | 30 | owner, issue #38 | An echo of a topic that never became a wave is removed this many days after its last recorded sighting, unless a summary cites it or a topic edit names it (`apps/pipeline/src/core/retention.ts`). Ingest records a sighting only when the owning group lists the echo and its title passes the keyword filters. The 30 days are the issue's; counting from the last recorded sighting rather than the first is the agent's reading (#38), not reviewed. |
| `rawRetentionDays` | 30 | owner, issue #38 | A scan's raw responses (`raw/<slot>/...` blobs) are removed this many days after the slot started. |
| `enrichPagesPerTopic` | 3 | owner, issue #45 ("at most three pages per topic") | The enrich step fetches at most this many of a selected wave's echoes' pages, one per fetch group first, oldest first. 0 turns enrich off. |
| `enrichPagesPerRun` | 9 | agent's proposal (#45), not reviewed | The run's cap on page fetches over every selected wave, in select's order: three pages for each of `summariesPerRun`'s three waves. A wave left without pages is written without source text. |
| `enrichPageMaxChars` | 4000 | agent's proposal (#45), not reviewed | Characters of a page's text kept for the summarize call: a news article's first few paragraphs, so three pages stay a small part of the prompt. |
| `enrichPageMaxKB` | 1024 | agent's proposal (#45), not reviewed | Bytes of a page's body read at most; the rest is not downloaded. Most article pages are smaller; a large page's text usually starts in its first megabyte. |

The `fresh` fixture set is a new installation, so its settings equal these
defaults; `packages/fixtures/src/settings.test.ts` checks that.
