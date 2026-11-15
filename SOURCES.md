**English** | [简体中文](SOURCES.zh-CN.md)

# Built-in Sources · 自带信息源一览

The sources Breaker Delta ships with, in one-to-one correspondence with `config.example.yaml`. **26 fetcher groups** in total, in three layers by propagation order: **L1 source layer** (where things appear first), **L2 fermentation layer** (discussion spreads, demand surfaces), **L3 verification layer** (checks only, never discovers).

Two global rules up front:

- **Multi-source resonance**: a topic needs ≥2 independent sources to count as a hotspot; a single source only makes it a "echo". RSS bundles (the official-blogs group, the tech-media group) and the directory group each count as **one source as a whole** — a company's own press release, many outlets reprinting it, or directories copying each other can never fake multi-source resonance.
- **Every source is tunable**: in your own `config.yaml`, add `enabled: false` to any source to turn it off, or `max_items: N` to truncate its items uniformly. Scan frequency is defined by the user; this catalog has nothing to do with frequency.

> The site's "Sources" page is a different thing: it lists the sources that **have actually contributed topics in published editions** (with contribution counts, appearance counts, and detail pages); this page is the catalog of **all built-in sources**, including ones that have not contributed a topic yet.

## L1 Source layer

### Official blogs group `official_blogs` (the whole group counts as 1 source, latest 5 items per feed)

First-hand announcements from labs and companies.

| Name | Feed |
|---|---|
| OpenAI News | https://openai.com/news/rss.xml |
| Google DeepMind | https://deepmind.google/blog/rss.xml |
| Google Research | https://research.google/blog/rss/ |
| Hugging Face Blog | https://huggingface.co/blog/feed.xml |
| Mistral AI | https://mistral.ai/news/rss |
| NVIDIA Blog | https://blogs.nvidia.com/feed/ |
| AWS Machine Learning | https://aws.amazon.com/blogs/machine-learning/feed/ |
| GitHub Blog · AI & ML | https://github.blog/ai-and-ml/feed/ |
| Microsoft Research | https://www.microsoft.com/en-us/research/feed/ |
| BAIR (Berkeley AI Research) | https://bair.berkeley.edu/blog/feed.xml |
| LangChain Blog | https://blog.langchain.com/rss.xml |
| Google Blog | https://blog.google/rss/ |
| Ollama Blog | https://ollama.com/blog/rss.xml |
| Databricks Blog | https://www.databricks.com/feed |
| Cloudflare Blog | https://blog.cloudflare.com/rss/ |
| GitHub Changelog | https://github.blog/changelog/feed/ |
| Mozilla Blog | https://blog.mozilla.org/en/feed/ |

### Platform and community signals

| Source | Rule |
|---|---|
| GitHub breakout repos `github` | Created ≤14 days with a daily average of ≥200 ★, or a single-day gain of ≥400 |
| Hacker News `hackernews` | Front page or high-scoring new posts |
| Show HN `show_hn` | The first scene of independent products launching themselves |
| Hugging Face models `huggingface` | New faces among the top 50 trending models |
| HF Spaces `hf_spaces` | Top 50 trending Spaces (the demos people actually try) |
| OpenRouter `openrouter` | Newest listed models; listed within 14 days is flagged "new" |
| Civitai `civitai` | Newest community models (SFW only); a base model suddenly getting many fine-tunes = a diffusion signal |
| arXiv `arxiv` | Latest submissions in cs.AI / cs.CL / cs.LG; one of the earliest sources of new methods and model names |
| HF Daily Papers `daily_papers` | Community-voted papers — the pre-screened version of arXiv, complementary to it |
| Product Hunt `producthunt` | The day's new products; without a token, via the public Atom feed (no vote counts) |
| GitHub Releases watch group `gh_releases` (the whole group counts as 1 source) | Release feeds of flagship open-source projects: llama.cpp, vLLM, Claude Code releases.atom, latest 5 each; swap the list in the config for your own stack |
| Federal Register `federal_register` | First-hand US federal texts (rules / proposed rules / notices / presidential documents) via the official keyless API: the earliest citable source for policy and regulation; the search terms are configurable |
| Bluesky `bluesky` | Public RSS of key accounts (the only keyless way to read Bluesky), the whole group counts as 1 source: Simon Willison, Karpathy, gdb (Greg Brockman), TechCrunch, The Verge, Wired, Ars Technica |
| X `x` | ⚠️ Needs your own API token; unavailable when not configured. A new name independently mentioned by ≥2 influential accounts counts as a signal; a single-account mention needs ≥100 likes |

## L2 Fermentation layer

### Tech media group `tech_media` (the whole group counts as 1 source, latest 5 items per feed)

Tech media + independent authors; many outlets reprinting the same story is not multi-source resonance.

| Name | Feed |
|---|---|
| TechCrunch · AI | https://techcrunch.com/category/artificial-intelligence/feed/ |
| The Verge · AI | https://www.theverge.com/rss/ai-artificial-intelligence/index.xml |
| Ars Technica · AI | https://arstechnica.com/ai/feed/ |
| MIT Technology Review · AI | https://www.technologyreview.com/topic/artificial-intelligence/feed |
| The Decoder | https://the-decoder.com/feed/ |
| Simon Willison | https://simonwillison.net/atom/everything/ |
| Import AI | https://importai.substack.com/feed |
| Latent Space | https://www.latent.space/feed |
| Interconnects | https://www.interconnects.ai/feed |
| Ahead of AI | https://magazine.sebastianraschka.com/feed |
| Dwarkesh Podcast | https://www.dwarkesh.com/feed |
| SemiAnalysis | https://semianalysis.substack.com/feed |
| One Useful Thing | https://www.oneusefulthing.org/feed |
| Platformer | https://www.platformer.news/feed |
| YC Blog | https://www.ycombinator.com/blog/feed |
| LessWrong | https://www.lesswrong.com/feed.xml |

### Community and market signals

| Source | Rule |
|---|---|
| Reddit `reddit` | rising/hot posts in r/all, r/artificial, r/LocalLLaMA, r/SideProject, r/technology; watch especially for spoken-aloud demand like "is there a tool that…" |
| DEV.to `devto` | The developer community's hot posts of the day |
| Lobsters `lobsters` | The hottest list; fermentation cross-validation with HN |
| Stack Exchange `stackexchange` | Hot questions across the whole network (public Atom, keyless): the problems developers are stuck on right now = a demand signal |
| Mastodon `mastodon` | The day's unique-account counts on mastodon.social trending links/tags (a substitute social signal while X has no free API) |
| Wikipedia most-read `wikipedia` | Yesterday's English Wikipedia top pageviews: mass-attention confirmation + social-observation material |
| AI tool directories `sitemaps` (the whole group counts as 1 source) | Sitemap snapshot diffs across 12 directories, reporting only tool pages never seen before: futurepedia, toolify, dang.ai, glama, mcp.so, lobehub-mcp, lobehub-skills, aixploria, opentools, clipfly, aitoptools, ai-bot.cn |
| App Store charts `app_store` | US top-grossing + top-free charts: an AI app breaking into the grossing chart = real paying demand |
| Google News `google_news` | Tech / AI topics; the same event reported by many outlets = it has entered the diffusion layer |

## L3 Verification layer

| Source | Rule |
|---|---|
| Google Trends `google_trends` | Only checks the curve shape of selected topics; **never a discovery source** |

---

*This page is compiled from `config.example.yaml`; to change sources, change the config first — this page is updated with each release. Last updated: 2026-11-15 (the 0.14.0 source list).*
