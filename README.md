![Breaker Delta · 浪尖雷达](assets/banner.png)

**English** | [简体中文](README.zh-CN.md)

# Breaker Delta · 浪尖雷达

*Catch it before it breaks.* 浪起之前，先有回波。

A web hot-topic radar: it catches new models, products, repos, and events at the source layer — before they reach mass search. How often it scans is defined by the user; nothing about the schedule is baked in.

**Live demo** — Dai's instance: [daiyanze.github.io/breaker-delta-data](https://daiyanze.github.io/breaker-delta-data/) (instance data repo: [daiyanze/breaker-delta-data](https://github.com/daiyanze/breaker-delta-data))

## How it works

Hot topics propagate in a fixed order: a lab or a big account posts first (X, Hugging Face), a GitHub repo breaks out, directories and media follow, and only at the very end does the Google Trends curve rise. Breaker Delta reads the first two steps and uses Trends only for after-the-fact verification. The design follows [zhuyansen/new-term-radar](https://github.com/zhuyansen/new-term-radar).

- **Three source layers** — L1 source layer (official blogs, GitHub, Hacker News, Hugging Face, Product Hunt, arXiv…), L2 fermentation layer (Reddit, tech media, directories, Google News…), L3 verification layer (Google Trends, checks only). 26 built-in fetcher groups, all free and keyless except X — see [SOURCES.md](SOURCES.md).
- **Resonance, not reprints** — a topic counts as a hotspot only when ≥2 genuinely independent sources carry it. Bundled groups (official blogs, tech media, directories) count as one source each, so a press release reprinted ten times is still one source. A single-source signal is recorded as a seed, not a hotspot.
- **Grading** — an agent grades candidates against fixed quantified thresholds as 🔥 Must / 👀 Watch / 🌱 Seed.
- **Wave height （浪高）** — every topic gets an uncapped score: grade base (Must 60 / Watch 30 / Seed 10) + 20 × independent sources + 8 × evidence links + 25 when first seen. The site ranks by wave height and tracks its rise and fall across editions.
- **Review loop** — 14 days after a topic is picked, it is reviewed: did it actually take off? The track record is public, misses included.

The full methodology — written for humans — is in [methodology.md](methodology.md).

## Repository layout

The repo is split into layers an agent can use directly:

| Layer | Where | What it does |
|---|---|---|
| Instructions | `skills/breaker-delta/SKILL.md` | The execution steps, judgment rules, and report template an agent follows |
| Config | `config.example.yaml` | Source list, quantified thresholds, keywords, timezone — tuning happens here only (YAML, JSON-compatible) |
| Engine | `packages/` + `apps/` | Deterministic work in code (below) |
| State | *your data repo* | Editions, the topic ledger, the track record — instance data never lives in this repo |

Engine packages (npm workspaces, TypeScript, zero runtime dependencies):

- `packages/core` — `@breaker-delta/core`: the domain logic — wave height, resonance grouping, classification, slugs, the topic store, the new-term vocabulary, review bookkeeping.
- `packages/fetchers` — `@breaker-delta/fetchers`: the 26 source groups, each normalizing its source into candidates.
- `packages/publisher` — `@breaker-delta/publisher`: the static site generator — wave board, rising board, seeds, categories, source pages, per-topic pages with wave charts, archive, track record, RSS/Atom feeds, sitemap.
- `apps/cli` — `@breaker-delta/cli`: one CLI (`scan` / `review` / `record` / `publish` / `doctor` / `mcp`), bundled into a single self-contained `breaker-delta.mjs`.
- `apps/extension` — the Chrome seed-catcher extension: one-click seed capture, wave-height badges on matched pages — see [apps/extension/README.md](apps/extension/README.md).

## Engine / data split

This repo contains **code only**. An instance's data — `editions/`, `state/` (topic ledger, vocab and sitemap baselines), `track-record.md`, and its `config.yaml` — lives in the user's own **data repo**. The data repo's CI checks out this engine, builds the site with the Node bundle, and deploys it to the data repo's GitHub Pages. [daiyanze/breaker-delta-data](https://github.com/daiyanze/breaker-delta-data) is a working example: clone its shape, point it at your own data, and the radar is yours.

## Quick start

Requires Node ≥ 20. No runtime dependencies.

```bash
git clone https://github.com/daiyanze/breaker-delta.git
cd breaker-delta
npm ci
npm run bundle        # builds apps/cli/dist/breaker-delta.mjs — a single file

BD="node apps/cli/dist/breaker-delta.mjs"
$BD --data-dir /path/to/your-data doctor                    # offline self-check
$BD --data-dir /path/to/your-data scan --edition morning    # fetch one edition's candidates
$BD --data-dir /path/to/your-data review                    # topics due for their 14-day review
$BD --data-dir /path/to/your-data publish --out site        # build the static site
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
node apps/cli/dist/breaker-delta.mjs --data-dir /path/to/your-data mcp
```

## Use it as a Skill

Install `skills/breaker-delta/` into your agent harness (Claude Code, Codex, …), or simply have the agent read `SKILL.md` and follow it: the skill runs the fetch layer with the CLI, grades candidates against the methodology, writes the edition file and the ledger back with `record`, and reports in a fixed format. Scheduling is entirely yours — your agent's cron, GitHub Actions, or manual runs; the radar itself prescribes no frequency.

## Configuration

Put a `config.yaml` in your data dir (based on `config.example.yaml`; YAML with a built-in subset parser — no dependencies — and JSON stays compatible). The knobs users actually turn:

| Option | What it does |
|---|---|
| `keywords.mute` | Candidates matching (title + summary, case-insensitive substring) are dropped |
| `keywords.boost` | Matches are flagged; a single-source seed can be promoted to Watch |
| `keywords.alert` | Matches are flagged and gathered into the candidate file's `keyword_alerts`; with a second source's resonance they become Must candidates |
| `topics` | Relevance weights (1–5) per topic area — switching industries mostly means editing this |
| `sources.<name>.enabled / max_items` | Turn any source off (reported as disabled, never as missing) or cap its items |
| `filters.max_age_hours` | Freshness window; only applies to candidates that carry a timestamp |
| `vocab.window_days` | New-term vocabulary: an entity name unseen within the window is flagged `novel` — the highest-priority seed signal. The first run only builds the baseline |

## Chrome extension

`apps/extension` is a Manifest V3 extension that shares `@breaker-delta/core` with the engine: capture a seed from any page in one click, see a wave-height badge when a page you open matches a tracked topic, and get an alert count on the icon. See [apps/extension/README.md](apps/extension/README.md) for loading and usage.

## Documentation

- [Methodology](methodology.md) — layers, thresholds, grading, the review loop (also in [简体中文](methodology.zh-CN.md))
- [Built-in sources](SOURCES.md) — all 26 fetcher groups and their rules (also in [简体中文](SOURCES.zh-CN.md))
- [Roadmap](ROADMAP.md) — from internal tool to public site, and what is already shipped (also in [简体中文](ROADMAP.zh-CN.md))
- [Privacy](PRIVACY.md) — read-only, no accounts, no posting
- [Changelog](CHANGELOG.md)

## Boundaries

Read-only access to public information; no posting, no interacting; secrets travel via environment variables only, never into the repo. See [PRIVACY.md](PRIVACY.md).

---

*History: Breaker Delta was originally implemented in Python. It was migrated in full to Node/TypeScript (0.16.0–0.20.0), production switched over, and the Python implementation was retired in 0.21.0 — archived at the git tag `v0.15.1-python-final`.*
