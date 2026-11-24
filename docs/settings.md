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
| `fetchTimeoutSeconds` | 20 | agent's proposal (#26), not reviewed | Per attempt for one source URL in the scan step, body included. Long enough for a slow feed, short enough that a dead one does not hold the run. |
| `fetchRetries` | 2 | agent's proposal (#26), not reviewed | Retries for network errors, 429 and 5xx only (`fetchSource`). Spike 2 saw intermittent 503s from `google_news`. |
| `fetchRetryDelaySeconds` | 2 | agent's proposal (#26), not reviewed | Doubled before each next retry: 2 s, then 4 s. |
| `assignBatchSize` | 20 | agent's proposal (#32), not reviewed | New echoes per assign model call. Small enough that one bad answer leaves few echoes for the next run, large enough that a busy hour takes a handful of calls. |
| `assignShortlistSize` | 30 | agent's proposal (#32), not reviewed | Existing topics offered per call, ranked by words shared with the batch's titles, then by latest activity. Keeps the prompt short. |
| `assignActivityDays` | 7 | agent's proposal (#32), not reviewed | A topic whose latest activity (the later of its latest echo and its creation) is older is not offered; a returning story starts a new topic. Same as `calmAfterDays`. |
| `echoRetentionDays` | 30 | owner, issue #38 | An echo of a topic that never became a wave is removed this many days after its last recorded sighting, unless a summary cites it or a topic edit names it (`apps/pipeline/src/core/retention.ts`). Ingest records a sighting only when the owning group lists the echo and its title passes the keyword filters. The 30 days are the issue's; counting from the last recorded sighting rather than the first is the agent's reading (#38), not reviewed. |
| `rawRetentionDays` | 30 | owner, issue #38 | A scan's raw responses (`raw/<slot>/...` blobs) are removed this many days after the slot started. |

The `fresh` fixture set is a new installation, so its settings equal these
defaults; `packages/fixtures/src/settings.test.ts` checks that.
