[English](SOURCES.md) | 简体中文（本页）

# 自带信息源一览 · Built-in Sources

Breaker Delta 开箱自带的信息源清单，与 `config.example.yaml` 一一对应。共 **26 个抓取组**，按传播顺序分三层：**L1 源头层**（事情最早出现的地方）、**L2 发酵层**（讨论扩散、需求浮现）、**L3 验证层**（只核对、不发现）。

两条全局规则先说清：

- **多源共振**：一个话题要有 ≥2 个独立来源才算热点，单源只算「苗头」。RSS 组合（官方博客组、科技媒体组）与目录站组内部**整组只算一个源**——自家通稿、多家转述、目录站互抄，都不能冒充多源共振。
- **每个源都可调**：在自己的 `config.yaml` 里给任何源加 `enabled: false` 关掉它，或加 `max_items: N` 统一截断条数。扫描频度由使用者自行定义，本清单与频度无关。

> 站点上的「数据源」页是另一回事：那里列的是**已经在各期节目中实际贡献过话题**的来源（带贡献数、出现次数与详情页）；本页是**全部自带源的目录**，包括还没贡献过话题的。

## L1 源头层

### 官方博客组 `official_blogs`（整组算 1 个源，每 feed 最新 5 条）

实验室与公司的一手公告。

| 名称 | Feed |
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
| BAIR（伯克利 AI 研究） | https://bair.berkeley.edu/blog/feed.xml |
| LangChain Blog | https://blog.langchain.com/rss.xml |
| Google Blog | https://blog.google/rss/ |
| Ollama Blog | https://ollama.com/blog/rss.xml |
| Databricks Blog | https://www.databricks.com/feed |
| Cloudflare Blog | https://blog.cloudflare.com/rss/ |
| GitHub Changelog | https://github.blog/changelog/feed/ |
| Mozilla Blog | https://blog.mozilla.org/en/feed/ |

### 平台与社区信号

| 源 | 口径 |
|---|---|
| GitHub 爆发仓库 `github` | 创建 ≤14 天且日均 ★ ≥200，或单日增量 ≥400 |
| Hacker News `hackernews` | 首页或高分新帖 |
| Show HN `show_hn` | 独立产品自发布的第一现场 |
| Hugging Face 模型 `huggingface` | Trending models 前 50 里的新面孔 |
| HF Spaces `hf_spaces` | Trending Spaces 前 50（人们真正上手试的 demo） |
| OpenRouter `openrouter` | 最新上架模型，上架 14 天内标「新」 |
| Civitai `civitai` | 最新社区模型（仅 SFW）；某基座突然被大量微调 = 扩散信号 |
| arXiv `arxiv` | cs.AI / cs.CL / cs.LG 最新提交，新方法与新模型名的最早出处之一 |
| HF Daily Papers `daily_papers` | 社区票选论文，arXiv 的已筛选版，与 arXiv 互补 |
| Product Hunt `producthunt` | 当日新品；无 token 时走公开 Atom feed（无票数） |
| GitHub Releases 观察组 `gh_releases`（整组算 1 个源） | 旗舰开源项目的版本发布：llama.cpp、vLLM、Claude Code 的 releases.atom，各取最新 5 条；名单可在配置里换成你自己的技术栈 |
| Federal Register `federal_register` | 美国联邦公告一手文本（规则 / 拟议规则 / 通知 / 总统文件），官方 API 免 key：政策与监管的最早可引来源；检索词可在配置里改 |
| Bluesky `bluesky` | 关键账号的公开 RSS（免 key 读 Bluesky 的唯一路），整组算 1 个源：Simon Willison、Karpathy、gdb（Greg Brockman）、TechCrunch、The Verge、Wired、Ars Technica |
| X `x` | ⚠️ 需自备 API token，未配置时不可用。一个新名字被 ≥2 个有影响力账号独立提到才算信号；单账号提及需 ≥100 赞 |

## L2 发酵层

### 科技媒体组 `tech_media`（整组算 1 个源，每 feed 最新 5 条）

科技媒体 + 独立作者；多家转述同一件事不算多源共振。

| 名称 | Feed |
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

### 社区与市场信号

| 源 | 口径 |
|---|---|
| Reddit `reddit` | r/all、r/artificial、r/LocalLLaMA、r/SideProject、r/technology 的 rising/热帖；特别留意 “is there a tool that…” 式说出口的需求 |
| DEV.to `devto` | 开发者社区当日热文 |
| Lobsters `lobsters` | hottest 列表，与 HN 互为发酵交叉验证 |
| Stack Exchange `stackexchange` | 全站热门问题（公开 Atom，免 key）：开发者当下卡住的问题 = 需求信号 |
| Mastodon `mastodon` | mastodon.social 趋势链接/标签的当日独立账号数（X 无免费 API 时的替代社交信号） |
| Wikipedia 热读榜 `wikipedia` | 英文维基昨日热读：大众注意力确认 + 社会观察供稿 |
| AI 工具目录站 `sitemaps`（整组算 1 个源） | 12 个目录站 sitemap 快照 diff，只报上次没见过的新工具页：futurepedia、toolify、dang.ai、glama、mcp.so、lobehub-mcp、lobehub-skills、aixploria、opentools、clipfly、aitoptools、ai-bot.cn |
| App Store 榜单 `app_store` | 美区畅销榜 + 免费榜：AI 应用冲进畅销榜 = 有真实付费需求 |
| Google News `google_news` | 科技 / AI 主题；同一事件多家报道 = 已进入扩散层 |

## L3 验证层

| 源 | 口径 |
|---|---|
| Google Trends `google_trends` | 只核对入选话题的曲线形状，**永不作为发现来源** |

---

*本页由 `config.example.yaml` 整理；改源先改配置，本页随版本更新。最后更新：2026-11-15（0.14.0 源单）。*
