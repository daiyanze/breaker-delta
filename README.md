![Breaker Delta](assets/banner.png)

**English** | [简体中文](README.zh-CN.md)

# Breaker Delta

*Catch it before it breaks.*

**The 30-second version** — Breaker Delta is an open-source radar that spots emerging topics *before* they trend. It scans 40+ sources, counts a topic as a hotspot only when ≥2 independent sources resonate, scores it with an uncapped **wave height**, and grades every pick in public — then reviews its own picks 14 days later, misses included. Run the public instance's engine for your own field with a swappable **preset**: your sources, your categories, your data repo.

**Live demo** — the author's instance (AI/tech preset): [breakerdelta.com](https://breakerdelta.com) · [Why Breaker Delta](https://breakerdelta.com/en/landing.html) · data repo: [daiyanze/breaker-delta-data](https://github.com/daiyanze/breaker-delta-data)

<!-- Launch assets: the 15-second board GIF and screenshots are inserted here in launch week (W3). -->

## Quick start

### Docker (recommended)

From zero to your first board — no code changes anywhere. Grading is done by your own AI agent following the Skill and pushed in; the container fetches, renders and hosts.

```bash
git clone https://github.com/daiyanze/breaker-delta.git
cd breaker-delta
# put a data directory in ./data — the breaker-delta-setup wizard Skill
# generates one conversationally, or copy the reference data repo's shape
cp .env.example .env   # set BD_PUSH_TOKEN to a long random string
docker compose up -d   # board at http://localhost:8080
```

Full walkthrough: [Getting Started](https://docs.breakerdelta.com/en/docs-getting-started.html) · [Deploy Your Own](https://docs.breakerdelta.com/en/docs-deploy.html).

### Local (Bun)

Requires Bun ≥ 1.2. No runtime dependencies, no database.

```bash
git clone https://github.com/daiyanze/breaker-delta.git
cd breaker-delta
bun install
bun run bundle        # builds apps/cli/dist/breaker-delta.mjs — a single file

BD="bun apps/cli/dist/breaker-delta.mjs"
$BD --data-dir /path/to/your-data doctor                    # offline self-check
$BD --data-dir /path/to/your-data scan --edition morning    # fetch one edition's candidates
$BD --data-dir /path/to/your-data publish --out site        # build the static site
$BD --data-dir /path/to/your-data serve                     # or serve it dynamically (push API included)
```

Writing graded topics back to the ledger is a first-class command (the store write is atomic):

```bash
echo '[{"name":"Some New Model","sources":["Hacker News","Reddit"],"grade":"must"}]' > picks.json
$BD --data-dir /path/to/your-data record picks.json
$BD --data-dir /path/to/your-data record review --name "Some New Model" --result hit
```

Every command takes `--data-dir` (or the `BD_DATA_DIR` env var) and supports `--json` for machine-readable output.

**MCP**: the same bundle is a stdio MCP server (tools `radar_scan`, `radar_review`) — register it in your agent harness:

```bash
bun apps/cli/dist/breaker-delta.mjs --data-dir /path/to/your-data mcp
```

## How it works

Hot topics propagate in a fixed order: a lab or a big account posts first (X, Hugging Face), a GitHub repo breaks out, directories and media follow, and only at the very end does the Google Trends curve rise. Breaker Delta reads the first two steps and uses Trends only for after-the-fact verification. The design follows [zhuyansen/new-term-radar](https://github.com/zhuyansen/new-term-radar).

- **Three source layers** — L1 source layer (official blogs, GitHub, Hacker News, Hugging Face, Product Hunt, arXiv…), L2 fermentation layer (Reddit, tech media, directories, Google News…), L3 verification layer (Google Trends, checks only). 26 built-in fetcher groups, all free and keyless except X — see [SOURCES.md](SOURCES.md).
- **Resonance, not reprints** — a topic counts as a hotspot only when ≥2 genuinely independent sources carry it. Bundled groups (official blogs, tech media, directories) count as one source each, so a press release reprinted ten times is still one source. A single-source signal is recorded as an echo, not a hotspot.
- **Grading** — an agent grades candidates against fixed quantified thresholds as 🔥 Must / 👀 Watch / 🌀 Echo.
- **Wave height** — every topic gets an uncapped score: grade base (Must 60 / Watch 30 / Echo 10) + 20 × independent sources + 8 × evidence links + 25 when first seen. The site ranks by wave height and tracks its rise and fall across editions.
- **Review loop** — 14 days after a topic is picked, it is reviewed: did it actually take off? The track record is public, misses included.
- **No fixed schedule** — how often it scans is defined by the user; nothing about the schedule is baked into the product or its copy.

## Presets

A **preset** is a swappable pack that aims the same engine at a different field: the source list, topic weights, keyword defaults, the **category rules**, and an industry brief for the scanning agent. The scoring machinery — resonance, wave height, grading, review — stays in the engine.

- `presets/ai-tech/` is the built-in example (and what the live demo runs).
- `breaker-delta preset list` shows the bundled presets; `preset init <name>` copies one into your data dir to make it yours.
- You don't have to write one by hand: the **breaker-delta-setup** wizard Skill interviews you (industry, categories, sources — each candidate source is fetch-tested before it is accepted) and writes the config for you.
- Configuration layers, lowest to highest: preset defaults ← your `config.yaml` ← environment variables.

## Plugins

A **plugin** answers the other question — not *what to watch* (that's the preset) but *what to do with a topic*. Panel plugins are declarative packs in `plugins/<id>/` (a manifest plus a panel definition; data-driven ones add a grading prompt and an output schema — no code). Three ship built in:

- `creator` — the writing-reference panel on topic pages (on by default; `TS_CREATOR=0` still turns it off).
- `investor` — an investment read (direction / tickers / horizon / logic / risks) with a mandatory disclaimer; never buy/sell instructions.
- `watchlist` — an anime/manga watchlist pick (work / status / why start / pacing).

Enable them per instance in the `plugins:` section of config.yaml. A data plugin renders only on topics where the grading agent actually produced its structured output — no output, no panel. Your own packs can live in your data dir's `plugins/` and override the built-in ones by id.

## Repository layout

The repo is split into layers an agent can use directly:

| Layer | Where | What it does |
|---|---|---|
| Instructions | `skills/breaker-delta/` + `skills/breaker-delta-setup/` | The run Skill (scan → grade → publish → report) and the setup wizard Skill |
| Config | `config.example.yaml` | Source list, quantified thresholds, keywords, timezone — tuning happens here only (YAML, JSON-compatible) |
| Presets | `presets/` | Swappable industry packs (sources / categories / keywords / brief) |
| Plugins | `plugins/` | Declarative topic-page panel packs (creator / investor / watchlist) |
| Engine | `packages/` + `apps/` | Deterministic work in code (below) |
| Templates | `templates/` | Deployment starters (Cloudflare Pages, Beta) |
| State | *your data repo* | Editions, the topic ledger, the track record — instance data never lives in this repo |

Engine packages (Bun workspaces, TypeScript, zero runtime dependencies):

- `packages/core` — `@breaker-delta/core`: the domain logic — wave height, resonance grouping, classification, slugs, the topic store, the new-term vocabulary, review bookkeeping.
- `packages/fetchers` — `@breaker-delta/fetchers`: the 26 source groups, each normalizing its source into candidates.
- `packages/publisher` — `@breaker-delta/publisher`: the static site generator — wave board, rising board, echoes, categories, source pages, per-topic pages with wave charts, archive, track record, landing page, RSS/Atom feeds, sitemap; also renders into memory for the dynamic server.
- `apps/cli` — `@breaker-delta/cli`: one CLI (`scan` / `review` / `record` / `publish` / `serve` / `preset` / `doctor` / `docs` / `mcp`), bundled into a single self-contained `breaker-delta.mjs`.
- `apps/extension` — the Chrome echo-catcher extension: one-click echo capture, wave-height badges on matched pages — see [apps/extension/README.md](apps/extension/README.md).

## Engine / data split

This repo contains **code only**. An instance's data — `editions/`, `state/` (topic ledger, vocab and sitemap baselines), `track-record.md`, and its `config.yaml` — lives in the user's own **data repo**. The data repo's CI checks out this engine, builds the site with the engine bundle, and deploys it. [daiyanze/breaker-delta-data](https://github.com/daiyanze/breaker-delta-data) is a working example: clone its shape, point it at your own data, and the radar is yours.

## Use it as a Skill

Install `skills/breaker-delta/` into your agent harness (Claude Code, Codex, …), or simply have the agent read `SKILL.md` and follow it: the skill runs the fetch layer with the CLI, grades candidates against the methodology, writes the edition file and the ledger back with `record`, and reports in a fixed format. New instance? Start with `skills/breaker-delta-setup/` — the wizard interviews you and writes your config and industry brief first. Scheduling is entirely yours — your agent's cron, GitHub Actions, or manual runs; the radar itself prescribes no frequency.

## Configuration

Put a `config.yaml` in your data dir (based on `config.example.yaml`; YAML with a built-in subset parser — no dependencies — and JSON stays compatible), or start from a preset and override only what differs. The knobs users actually turn:

| Option | What it does |
|---|---|
| `keywords.mute` | Candidates matching (title + summary, case-insensitive substring) are dropped |
| `keywords.boost` | Matches are flagged; a single-source echo can be promoted to Watch |
| `keywords.alert` | Matches are flagged and gathered into the candidate file's `keyword_alerts`; with a second source's resonance they become Must candidates |
| `topics` | Relevance weights (1–5) per topic area — switching industries mostly means editing this |
| `categories` | The classification rules for your field (title-first matching, your fallback category, per-language names) |
| `sources.<name>.enabled / max_items` | Turn any source off (reported as disabled, never as missing) or cap its items |
| `filters.max_age_hours` | Freshness window; only applies to candidates that carry a timestamp |
| `vocab.window_days` | New-term vocabulary: an entity name unseen within the window is flagged `novel` — the highest-priority echo signal. The first run only builds the baseline |

## Chrome extension

`apps/extension` is a Manifest V3 extension that shares `@breaker-delta/core` with the engine: capture an echo from any page in one click, see a wave-height badge when a page you open matches a tracked topic, and get an alert count on the icon. See [apps/extension/README.md](apps/extension/README.md) for loading and usage.

## Documentation

- **Site docs (Chinese / English)** — the usage guide on its own site (docs.breakerdelta.com, separate from any instance): [Docs overview](https://docs.breakerdelta.com/docs.html) · [Docs in English](https://docs.breakerdelta.com/en/docs.html) — getting started, reading the site, CLI reference, configuration, Skill & MCP, the Chrome extension, and deploying your own instance. Source: `packages/publisher/src/docs.ts`; Japanese sites show the English docs for now.
- [Built-in sources](SOURCES.md) — all 26 fetcher groups and their rules (also in [简体中文](SOURCES.zh-CN.md))
- [Privacy](PRIVACY.md) — read-only, no accounts, no posting
- [Changelog](CHANGELOG.md)

## Boundaries

Read-only access to public information; no posting, no interacting; secrets travel via environment variables only, never into the repo. See [PRIVACY.md](PRIVACY.md).

## License

[Apache License 2.0](LICENSE). The code is everyone's to use, including commercially; the Breaker Delta name and brand are not granted by the license.

---

*History: Breaker Delta was originally implemented in Python. It was migrated in full to Node/TypeScript (0.16.0–0.20.0), production switched over, and the Python implementation was retired in 0.21.0 — archived at the git tag `v0.15.1-python-final`.*
