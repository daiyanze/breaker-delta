# Settings defaults

What each setting starts as, and why (#16). The values live in
`SettingsSchema` in `packages/contracts/src/model.ts` (invariant 9, ADR
0008). A setting can be changed in the database without a release; this
page is only about where a new installation starts. Decided by the owner on
2026-11-22, except where a row says otherwise.

| Setting | Default | Why |
| --- | --- | --- |
| `runIntervalMinutes` | 60 | Hourly runs. The timer fires every 15 minutes and only checks whether a run is due. |
| `waveThreshold` | 3 | With 20 source groups, two groups agreeing (say, Hacker News and Lobsters) is common. Three groups is a clearer signal. |
| `halfLifeHours` | 24 | The site is read as one edition a day, so an echo's weight halves over a day. |
| `calmAfterDays` | 7 | Unchanged. |
| `risingPercent24h` | 50 | Unchanged. |
| `rewriteAfterNewEchoes` | 5 | Unchanged. |
| `summariesPerRun` | 3 | 72 summaries a day at hourly runs, which the free tiers of the summarize chain cover (`docs/providers.md`, "Budget"). |
| `reviewWindowDays` | 14 | Unchanged. |
| `languages` | en, zh, ja | Unchanged. |
| `keywordsInclude`, `keywordsExclude` | empty | Unchanged. |
| `assignProviders`, `summarizeProviders` | empty | No provider is built in (ADR 0005). An installation is set up with the chains in `docs/providers.md`. |
| `feedLimit` | 100 | Unchanged. |
| `timeZone` | Asia/Tokyo | The site's time zone: day boundaries, labels and the mail send time. Decided on 2026-11-21. |
| `mailSendTime` | 08:00 | The edition mail goes out at one time of day in `timeZone`, to everyone at the same moment (#156, #157). Decided on 2026-11-21. |
| `stepMaxAttempts` | 3 | Unchanged. |
| `runLeaseMinutes` | 30 | Unchanged. |

The `fresh` fixture set is a new installation, so its settings equal these
defaults; `packages/fixtures/src/settings.test.ts` checks that.
