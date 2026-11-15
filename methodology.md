**English** | [简体中文](methodology.zh-CN.md)

# Web Hot-Topic Scanning · Methodology

Customized for Dai, two scans a day: morning 06:00 JST (scanning the fermentation results of the European/US night) + evening 18:00 JST (scanning new echoes from the Asian daytime + the European/US early morning).
Adapted from the core idea of zhuyansen/new-term-radar (https://github.com/zhuyansen/new-term-radar): **hot topics propagate in a fixed order — catch them at the source layer, before they reach mass search.**

## 1. Core principle: the propagation chain of a hot topic

A new hot topic (a new model, product, term, or event) leaves traces in a fixed order:

1. Source layer: a lab or a big account posts first on X, something trends on Hugging Face, a GitHub repo suddenly blows up
2. Fermentation layer: Hacker News / Reddit start discussing it, developers and early users follow
3. Diffusion layer: directories and media pick it up, it headlines Google News
4. Mass layer: the Google Trends curve rises — by then it is already days to weeks late

Ordinary news tools read layers 3 and 4. This radar mainly reads layers 1 and 2, uses layer 3 for cross-confirmation, and uses layer 4 only to verify after the fact whether its own judgment was right.

## 2. Source layers (checked on every scan)

### L1 Source layer (appears first, highest weight)
- **X**: Trending + key AI/tech accounts (where new models, products, and terms are spoken aloud for the first time). No free official API; needs a token — when not configured, the agent fills in by scanning the web
- **Official blogs** (RSS group): first-hand announcements from OpenAI, DeepMind, Google Research, Hugging Face, Mistral, NVIDIA, AWS ML, GitHub Blog, BAIR (the list follows AIHOT's T1 tiering; swap in your own industry's sources in the config)
- **GitHub**: Trending + breakout repos (criteria in section 3)
- **Hacker News**: front page + high-scoring posts in new
- **Show HN**: launch posts of independent products, the first scene (counted separately from the HN front page)
- **Hugging Face**: new faces among the top 50 trending models
- **HF Spaces**: top 50 trending Spaces (the demos people actually try; new-term-radar also lists Spaces separately)
- **OpenRouter**: newest listed models (sorted by creation time, marked new within 14 days) — a model listing often precedes the announcement hype
- **Civitai**: newest community models (SFW only); a base model suddenly getting many fine-tunes = diffusion has begun
- **arXiv**: latest submissions in cs.AI / cs.CL / cs.LG — one of the earliest sources of new methods and model names
- **HF Daily Papers**: community-voted papers — the "already screened once by peers" version of the same research, complementary to arXiv
- **Bluesky**: public RSS of key accounts (bloggers + media) — the search API requires auth, account RSS is keyless, the closest substitute when X is absent
- **Product Hunt**: the day's new products (without a token, via the public Atom feed, no vote counts)

### L2 Fermentation layer (confirms the heat is spreading)
- **Reddit**: r/all rising + hot posts in relevant subreddits (r/artificial, r/LocalLLaMA, r/SideProject, r/technology, etc.); watch especially for spoken-aloud demand like "is there a tool that…"
- **Tech media** (RSS group): TechCrunch, The Verge, Ars Technica, MIT Technology Review, The Decoder + independent authors (Simon Willison, Import AI, Latent Space) (following AIHOT's T2 tiering)
- **DEV (dev.to)**: the developer community's hot posts of the day
- **Lobsters**: the hottest list, cross-validation with HN
- **Mastodon**: trending links/tags on big instances (mastodon.social); the day's unique-account count is the discussion volume — a social-signal substitute when X has no free API
- **Directory sitemaps**: new tool pages on 12 AI tool directories — Futurepedia, Toolify, dang.ai, Glama, mcp.so, LobeHub (MCP / Skills), Aixploria, OpenTools, Clipfly, aitotools, ai-bot.cn (borrowing new-term-radar's sitemap signal: a directory creating a page for a new tool = it has entered the diffusion layer). Since 0.5.0 the method is a **snapshot diff**: every URL each directory has ever shown is archived (`state/sitemap-seen.json`), and only URLs absent from the last snapshot are reported — the same tool is reported only the first time, and repeat broadcasts inside a time window drop to zero; each directory's first run only builds a baseline and emits nothing.
- **App Store charts**: US top-grossing + top-free charts — an AI app climbing the charts is a money signal that "someone is paying"
- **Wikipedia most-read**: yesterday's top pageviews on English Wikipedia — a mass-layer sensor, and the main supplier for the social-observation dimension (it only confirms mass attention; it produces no tech signals)
- **Google News**: tech/AI headlines (the same event covered by many outlets = it has entered the diffusion layer)

> **Group-source rule (against fake resonance)**: inside an RSS group (official blogs, tech media) or the sitemap group, however many outlets there are, the whole group counts as **1 source**. One company's press release reprinted by ten outlets, or one tool copied by five directories, is not multi-source resonance — resonance must come from genuinely independent sources.

### L3 Verification layer (checks only, never a discovery source)
- **Google Trends**: used only to check the curve shape of echo terms (is it really rising, on which day did it start), never to find hot topics — it is the most lagging signal of all
- Supplementary sources (when there is spare capacity): YouTube trending, Douyin/TikTok hot search terms

## 3. Signal judgment (what counts as a hot topic)

To enter the report, an item must pass three gates:

1. **Cross-source resonance**: the same topic appearing in ≥2 independent sources = a "hotspot"; appearing in only 1 source = a "echo", labeled separately and never mixed into the hotspot list. A single-source blowup is the most likely to be marketing or chance.
2. **Quantified thresholds** (criteria borrowed from new-term-radar):
   - GitHub: repo created <14 days ago with an average of 200+ stars/day, or +400 stars in a single day
   - X: a new name independently mentioned by ≥2 influential accounts; a single-account mention needs 100+ likes to count
   - HN/Reddit: reaches the front page / the front of rising, or a comment count clearly above the subreddit's daily norm
3. **New-term filter**: what gets reported is "one specific new thing" (a new model name, product name, repo name, event), not generic words (ordinary words like dashboard or pricing never count as hot topics).

## 4. Scoring and grading

Each candidate is scored on 4 dimensions (1–5 each); the total decides the grade:

| Dimension | What it looks at |
|---|---|
| Resonance | How many sources show it at once, how fast media follow |
| Growth rate | How much it rose compared with the previous scan (so archiving for comparison is mandatory, see section 5) |
| Freshness | How long since it first appeared — the earlier, the more valuable |
| Relevance to Dai | AI Agents / independent products / developer tools / content creation / social observation |

- 🔥 **Must-see**: resonance ≥3 sources + high relevance — worth writing a tweet about or digging into the same day
- 👀 **Watch**: 2-source resonance or a strong single-source signal — goes on the watch list; check its growth at the next scan
- 🌀 **Echo**: weak single-source signal — one line only, no expansion

Each report carries only 5–8 items: must-see first, at most 3 echoes. Rather report less than pile up volume.

## 5. Dedup and trend tracking (what makes a radar different from a news list)

- Maintain a ledger `~/workspace/hot-news-radar/seen-topics.md`: for each topic record the first-seen time, sources, and grade changes.
- Before each scan, compare against the ledger: new topics are marked 🆕; old topics only report **state changes** (promoted / cooling / dead), never re-introduce the background.
- The evening report adds a "Today's changes" section: are the topics from this morning rising, flat, or cooling?
- **14-day review** (borrowing the repo's review mechanism): 14 days after a topic is reported, look back at whether its search-heat peak exceeded 2× its pre-report baseline + 10 points. Exceeding it = a hit. Aggregate the hit rate weekly, broken down by source — whichever source's signals are most accurate gets a higher weight later; sources that stay inaccurate get down-weighted or dropped.

## 6. Output format of each edition

```
📰 Hot-Topic Radar · {Morning/Evening report} {date} {time} JST

🔥 Must-see (n items)
1. {the topic in one sentence} — {why it is hot, with the key numbers}
   Sources: X / GitHub / HN (with links)
   Suggested action: write a tweet / research in depth / watch as a project idea / just record

👀 Watch (n items)…
🌀 Echoes (n items, one line each)…

📈 Today's changes (evening report only): {state changes of old topics}
⚠️ Missing this edition: {sources that could not be checked / were blocked — written honestly, never pretend everything was scanned}
```

Hard rules:
- Every number must have a source (which source, what magnitude); never write unquantified adjectives like "exploding" or "all over the feed".
- Sources that cannot be checked are labeled missing, honestly; never substitute another source's content for them.
- Suggested actions offer judgment only; they never decide for Dai what to write or what product to build.

## 7. Division of labor between the morning and evening reports

- **Morning report 06:00**: covers the European/US night (JST early morning = US Eastern afternoon to midnight), the main production zone of AI hot topics; the focus is new faces at the L1 source layer.
- **Evening report 18:00**: covers the Asian daytime + the European/US early morning; the focus is fermentation confirmation + today's changes + re-checking echo growth.

## 8. Cost and boundaries

- Everything is done with public pages/search; no paid API key is needed (new-term-radar's paid sources like AIsa, and AIHOT's SocialData (X) / Dajiala (WeChat) are not adopted for now; X is still covered by the agent scanning the web, and if X signals ever prove insufficient, that can be revisited).
- From 0.3.0 the fetch layer has 19 sources; 0.3.1 raised it to 22 (adding Daily Papers, Bluesky, and Wikipedia, all English sources; by Dai's choice, the Chinese sources Bilibili/V2EX/Shaoshupai were not connected in this round): 21 are fetched live keylessly (see section 2); only X needs a token. Tried but not connected: the Stack Exchange API (this machine's egress IP was rate-limited for 11 hours — good signal, but unstable), Bluesky public search (403), Microsoft Research RSS (403) — all wait until conditions change; never force-fill the roster.
- 0.5.0 added no sources: the directory group grew 3 → 12 and switched to snapshot diff (see section 2); the new-term vocabulary was added (see section 9).
- Read and summarize public information only; no posting, no interacting.
- Reports are sent back to the main chat; the ledger and methodology live under `~/workspace/hot-news-radar/` and can be changed at any time.

## 9. User controls (0.4.0)

Since 0.4.0 the config is YAML-first (`config.yaml`, JSON-compatible). The options a user can control — which steer only "what the radar looks at" and never touch the judgment skeleton:

- **Keyword trio** (substring matching, applied to title + summary): `keywords.mute` block words (matching candidates are dropped — subtraction), `keywords.boost` boost words (matches are flagged; a single-source item can be promoted one grade), `keywords.alert` alert words (matches are gathered into the candidate file's `keyword_alerts`; with a second source's resonance they become must-see candidates). All three are executed by code after fetching and before resonance grouping; grading still belongs to the agent.
- **Topic weights** `topics`: relevance goes from binary to weighted (1–5); switching industries mainly means editing this section; the old flat-list form stays compatible (weight 1).
- **Per-source switch and cap**: `sources.<source>.enabled: false` turns a source off (strictly distinct from "missing" — no fill-in scanning, no missing report); `sources.<source>.max_items` truncates uniformly after fetching (different from each source's own fetch parameter `limit`).
- **Freshness window** `filters.max_age_hours`: only filters candidates with a parseable timestamp (arXiv, the RSS groups, Bluesky, Google News, etc. carry timestamps; sources without timestamps are not killed for a missing field).
- **New-term vocabulary** `vocab` (0.5.0): borrowing new-term-radar's core mechanism — a rolling vocabulary is maintained (`state/vocab.json`); if the name of an entity-type source (GitHub / HF / HF Spaces / OpenRouter / Civitai / Product Hunt / directories / App Store) has not appeared in the candidate stream within `window_days` (default 60), the candidate is flagged `"novel": true`. The first run only builds the baseline and flags nothing, so novel means "first appearance since you started watching", not "first appearance on the whole web". Text-type sources (whose titles are sentences) do not enter the vocabulary; their novelty is still judged by the agent. novel is the highest-priority echo signal: single-source + novel deserves the agent's priority check.

The principle does not change: unset = default behavior; the options only filter and flag, and never make semantic judgments for the agent.
