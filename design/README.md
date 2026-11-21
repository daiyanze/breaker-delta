# Design

The UI design for Breaker Delta: the Tide Paper design system, 52 boards, and the approved desk strings. The UI issues (label `ui`) point here.

## What is in this folder

| Path | What it is |
| --- | --- |
| `system/README.md` | The design system's brand book: principles, page list, decisions. Written in Chinese. |
| `system/tokens.json` | Colours (light and dark), type scale, spacing, radius, shadow, line widths. The source for CSS variables. |
| `system/components/<Name>/README.md` | What each component is and its rules. Written in Chinese. |
| `system/components/<Name>/preview.html` | A small standalone HTML preview of the component. Opens in a browser. |
| `boards/*.dc.html` | One file per board. See the index below. |
| `boards/canvas.json` | Position, size and title of every board on the canvas. |
| `strings/*.json` | Desk strings in English, Chinese and Japanese, keyed. Approved on 2026-11-21. |
| `strings/reviewed-tables.zh.md` | The same strings as review tables, with runtime values marked `[ ]`. |

## How to read a board

A board is an HTML file written for a design canvas. Read it as source: the markup and the `<style>` block inside `<helmet>` are the design. Three things differ from plain HTML:

- `<script src="./support.js">` is the canvas runtime. It is not in this repository, so a board does not render by opening the file. The component previews in `system/` do.
- `{{ name }}` is a value filled in by the small `Component` class at the bottom of the file (`renderVals()`), usually for a theme or language switch.
- Colours are CSS variables on `.tp` (light) and `.tp.dk` (dark). They are the same tokens as `system/tokens.json`.

## Rules for building from these files

- Take colour, type size and spacing from `system/tokens.json`. Do not copy literal values from a board.
- Where a board and a component README disagree, follow the README and say so in the issue.
- All data on the boards is sample data. Numbers named in issues (196, "16 waves up") only point at a place on a board.
- **The boards were never rendered and checked by their author.** Expect small layout mistakes; fix them in code and note it in the issue.
- "Reference sheet" boards are not pages. They show states or variants of something that lives on another board.
- Components are built from this design system. No third-party component library is used (ADR 0015).

## Board index

| No. | File | Board | Size | Interactive |
| --- | --- | --- | --- | --- |
| 01 | [`Front2.dc.html`](boards/Front2.dc.html) | Front page | 1440×4400 | yes |
| 02 | [`FrontMobile.dc.html`](boards/FrontMobile.dc.html) | Front page, mobile | 390×5900 | yes |
| 03 | [`Topic2.dc.html`](boards/Topic2.dc.html) | Topic page /topic/{slug} | 1440×4300 | yes |
| 04 | [`Topic2Mobile.dc.html`](boards/Topic2Mobile.dc.html) | Topic page, mobile | 390×5400 | yes |
| 05 | [`ShareCard.dc.html`](boards/ShareCard.dc.html) | Share card, 1200 × 630 | 1200×630 |  |
| 06 | [`Record2.dc.html`](boards/Record2.dc.html) | Track record, before any verdict | 1440×3200 | yes |
| 07 | [`Record2Done.dc.html`](boards/Record2Done.dc.html) | Track record, with verdicts | 1440×3700 | yes |
| 08 | [`Record2Mobile.dc.html`](boards/Record2Mobile.dc.html) | Track record, mobile | 390×5600 | yes |
| 09 | [`About2.dc.html`](boards/About2.dc.html) | About /about | 1440×3900 | yes |
| 10 | [`About2Mobile.dc.html`](boards/About2Mobile.dc.html) | About, mobile | 390×5600 | yes |
| 11 | [`Changes2.dc.html`](boards/Changes2.dc.html) | Changes | 1440×2700 | yes |
| 12 | [`Changes2Mobile.dc.html`](boards/Changes2Mobile.dc.html) | Changes, mobile | 390×3900 | yes |
| 13 | [`Echoes2.dc.html`](boards/Echoes2.dc.html) | Echoes | 1440×3300 | yes |
| 14 | [`Echoes2Mobile.dc.html`](boards/Echoes2Mobile.dc.html) | Echoes, mobile | 390×5200 | yes |
| 15 | [`Sources2.dc.html`](boards/Sources2.dc.html) | Sources | 1440×2700 | yes |
| 16 | [`Sources2Mobile.dc.html`](boards/Sources2Mobile.dc.html) | Sources, mobile | 390×4300 | yes |
| 17 | [`Empty2.dc.html`](boards/Empty2.dc.html) | Front page, first run (no data yet) | 1440×2500 | yes |
| 18 | [`Empty2Mobile.dc.html`](boards/Empty2Mobile.dc.html) | Front page, first run, mobile | 390×3500 | yes |
| 19 | [`Quiet2.dc.html`](boards/Quiet2.dc.html) | Front page, quiet day (2 waves) | 1440×2900 | yes |
| 20 | [`Errors2.dc.html`](boards/Errors2.dc.html) | Error states (reference sheet, not a page readers reach) | 1440×3000 | yes |
| 21 | [`NotFound2.dc.html`](boards/NotFound2.dc.html) | Not found | 1440×1700 | yes |
| 22 | [`SourceDetail2.dc.html`](boards/SourceDetail2.dc.html) | Source detail /sources/{group} | 1440×3300 | yes |
| 23 | [`SourceDetail2Mobile.dc.html`](boards/SourceDetail2Mobile.dc.html) | Source detail, mobile | 390×4700 | yes |
| 24 | [`Admin2.dc.html`](boards/Admin2.dc.html) | The desk /admin | 1440×2600 | yes |
| 25 | [`Icon2.dc.html`](boards/Icon2.dc.html) | Icon: lighthouse and wave | 1600×1060 |  |
| 26 | [`Search2.dc.html`](boards/Search2.dc.html) | Search /search?q= | 1440×2900 | yes |
| 27 | [`Search2Mobile.dc.html`](boards/Search2Mobile.dc.html) | Search, mobile | 390×4300 | yes |
| 28 | [`SearchNone2.dc.html`](boards/SearchNone2.dc.html) | Search, nothing found | 1440×1900 | yes |
| 29 | [`Email2.dc.html`](boards/Email2.dc.html) | Emails: confirm, the morning edition, the weekly edition | 2380×1900 |  |
| 30 | [`Unsub2.dc.html`](boards/Unsub2.dc.html) | Unsubscribed /unsubscribe | 1440×1700 | yes |
| 31 | [`Unsub2Mobile.dc.html`](boards/Unsub2Mobile.dc.html) | Unsubscribed, mobile | 390×2300 | yes |
| 32 | [`Forms2.dc.html`](boards/Forms2.dc.html) | Subscribe form states (reference sheet) | 1600×1120 |  |
| 33 | [`Mascots2.dc.html`](boards/Mascots2.dc.html) | Mascots: Delta the cat and Breaker the gull | 1600×1880 |  |
| 34 | [`ShareCardTall.dc.html`](boards/ShareCardTall.dc.html) | Share card, tall, 1080 × 1920 (phones) | 1080×1920 |  |
| 35 | [`Cjk2.dc.html`](boards/Cjk2.dc.html) | Chinese and Japanese typography | 1600×1520 |  |
| 36 | [`Confirmed2.dc.html`](boards/Confirmed2.dc.html) | Subscription confirmed /confirm | 1440×1700 | yes |
| 37 | [`Confirmed2Mobile.dc.html`](boards/Confirmed2Mobile.dc.html) | Subscription confirmed, mobile | 390×2300 | yes |
| 38 | [`Expired2.dc.html`](boards/Expired2.dc.html) | Confirmation link expired | 1440×1700 | yes |
| 39 | [`Prefs2.dc.html`](boards/Prefs2.dc.html) | Subscription preferences /subscription | 1440×2000 | yes |
| 40 | [`Prefs2Mobile.dc.html`](boards/Prefs2Mobile.dc.html) | Subscription preferences, mobile | 390×2700 | yes |
| 41 | [`Privacy2.dc.html`](boards/Privacy2.dc.html) | Privacy /privacy (text page template) | 1440×3300 | yes |
| 42 | [`Privacy2Mobile.dc.html`](boards/Privacy2Mobile.dc.html) | Privacy, mobile | 390×4800 | yes |
| 43 | [`Terms2.dc.html`](boards/Terms2.dc.html) | Terms /terms | 1440×2800 | yes |
| 44 | [`TopicStates2.dc.html`](boards/TopicStates2.dc.html) | Topic page: flat, verdict in, merged (reference sheet) | 1600×1240 |  |
| 45 | [`DeskSignin2.dc.html`](boards/DeskSignin2.dc.html) | The desk: sign-in, by method and outcome | 1440×1180 | yes |
| 46 | [`DeskSetup2.dc.html`](boards/DeskSetup2.dc.html) | The desk: first-run setup | 1440×1560 | yes |
| 47 | [`SiteCards2.dc.html`](boards/SiteCards2.dc.html) | Site share cards: front page, track record, about | 1720×2900 |  |
| 48 | [`Consent2.dc.html`](boards/Consent2.dc.html) | Cookie choice bar and visit counters | 1600×1500 |  |
| 49 | [`DeskMail2.dc.html`](boards/DeskMail2.dc.html) | The desk: Mail | 1440×3640 | yes |
| 50 | [`EmailTpls2.dc.html`](boards/EmailTpls2.dc.html) | Email templates: notice, correction, announcement, letter | 2740×1180 |  |
| 51 | [`SummaryStates2.dc.html`](boards/SummaryStates2.dc.html) | Topic page: unverified, source not read, withdrawn, no summary (reference sheet) | 1600×1180 |  |
| 52 | [`ComposerFields2.dc.html`](boards/ComposerFields2.dc.html) | The desk: fields for the correction, announcement and letter templates (reference sheet) | 1600×1240 |  |

Boards 51 and 52 were added on 2026-11-21 and have not been reviewed by the owner yet.

## Keeping this in step

The live canvas and design system are kept outside the repository. This folder is a copy taken on 2026-11-21. When the design changes, export again and replace the folder in one PR.
