# Settings defaults

What each setting starts as, and why (#16). The values live in
`SettingsSchema` in `packages/contracts/src/model.ts` (invariant 9, ADR
0008). A setting can be changed in the database without a release; this
page is only about where a new installation starts.

The "Decided" column says who set each value. "Scaffold" means the value
came with the scaffold and has not been reviewed by the owner yet.

| Setting | Default | Decided | Why |
| --- | --- | --- | --- |
| `runIntervalMinutes` | 60 | scaffold | Hourly runs. The timer fires every 15 minutes and only checks whether a run is due. |
| `waveThreshold` | 3 | owner, 2026-11-22 | With 20 source groups, two groups agreeing (say, Hacker News and Lobsters) is common. Three groups is a clearer signal. |
| `halfLifeHours` | 24 | owner, 2026-11-22 | The site is read as one edition a day, so an echo's weight halves over a day. |
| `calmAfterDays` | 7 | scaffold | |
| `risingPercent24h` | 50 | scaffold | |
| `rewriteAfterNewEchoes` | 5 | scaffold | |
| `summariesPerRun` | 3 | proposed by the agent | 72 summaries a day at hourly runs. No single free tier covers that together with assign; the three together likely do, but it is not measured (`docs/providers.md`, "Budget"). |
| `reviewWindowDays` | 14 | scaffold | |
| `languages` | en, zh, ja | scaffold | |
| `keywordsInclude`, `keywordsExclude` | empty | scaffold | |
| `assignProviders`, `summarizeProviders` | empty | ADR 0005 | No provider is built in (ADR 0005). An installation is set up with the chains in `docs/providers.md`. |
| `feedLimit` | 100 | scaffold | |
| `timeZone` | Asia/Tokyo | owner, 2026-11-21 | The site's time zone: day boundaries, labels and the mail send time. |
| `mailSendTime` | 08:00 | owner, 2026-11-21 | The edition mail goes out at one time of day in `timeZone`, to everyone at the same moment (#156, #157). |
| `stepMaxAttempts` | 3 | scaffold | |
| `runLeaseMinutes` | 30 | scaffold | |

The `fresh` fixture set is a new installation, so its settings equal these
defaults; `packages/fixtures/src/settings.test.ts` checks that.
