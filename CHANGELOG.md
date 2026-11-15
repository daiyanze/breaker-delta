# Changelog

## 0.18.0 — 2026-11-15（未发布，Node 迁移 Phase 3）

- **Phase 3 `@breaker-delta/publisher`**：站点生成器全量迁 TS（strict、零运行时依赖，依赖 `@breaker-delta/core`）——数据装载（editions 排序/_heat/_rank、ledger、config 原文块切分与 source 归组）、favicon 缓存与抓取（条件复验、Google 回退、sha256 变更检测、meta.json indent=1）、全部页面（海浪榜+时间滑块+溢出分页、涨潮榜、苗头、分类/等级标签页、数据源+源详情、归档、关于、战绩、投苗、edition 快照、话题页+creator 面板+旧链接跳转桩）、feeds（RSS/Atom，RFC2822 日期按 email.utils 语义）、write_discovery（sitemap/robots/llms）与 data 层（调 core 的 topicsData/alertsData）。入口 `buildSite(options)` 显式参数 + `optionsFromEnv()` 读与 Python 相同的 TS_* 环境变量，数据仓 CI 契约原样可迁；STRINGS/ABOUT/CSS 等大表由 `scripts/make_publisher_literals.py` 从 Python 机械生成、不手工转录。Python 生成器原样保留。
- **对等验证三层**：① Fixture 逐字节 diff（`scripts/diff_builds.py`，ED1/ED2 + 战绩 fixture）：92 文件全同，favicon meta.json 哈希两边构建前后不变。② 真实数据逐字节 diff（沙箱组装数据仓 5 期 + 台账 + 战绩，生产 base_url/data_repo，共用一份热 favicon 缓存）：第一轮 557 文件 545 同，12 处差异全源于 bloomberg.com 一家——构建时段 Bloomberg 间歇性对 Python 请求返回机器人挑战页（走 Google 回退得 PNG），Node 随后拿到真实 ICO；探针复测两栈响应逐字节相同，背靠背重跑第二轮 **554 文件全同**，favicon 统计两边同为 36 hit / 0 updated / 0 miss（结论留 `~/workspace/bd-pubdiff/DIFF-CONCLUSION.md`）。③ `tests/test_publish.py` 9 个测试在 TS 侧有对应测试（`packages/publisher/test/publish.test.ts`）全过。
- 根 `package.json` 与各包版本升 0.18.0，根 test/build 脚本串联 core + fetchers + publisher（npm test 共 175 个全过）；Python `pytest` 仍 52 全过。

## 0.17.0 — 2026-11-15（未发布，Node 迁移 Phase 2）

- **Phase 2 `@breaker-delta/fetchers`**：抓取层全量迁 TS（strict、零运行时依赖，依赖 `@breaker-delta/core`）——`common`（getJson/getText/postJson、parseFeed、fetchFeedBundle、ok/missing、FetchError）、自写 XML 子集解析器（元素/属性/文本/CDATA/实体/命名空间展开，不引第三方包）、config 加载（搜索顺序同 Python）+ YAML 子集解析器（`yamlmini.py` 的逐行移植，子集外构造如锚点/多行字符串抛错而非误读）、全部 25 个 fetcher（注册表顺序与 Python 一致）与最小编排 `runScan`/`summaryLines`（Phase 4 再做正式 CLI）。Python 抓取器原样保留。
- **对等验证两层**：① Golden——`scripts/make_golden_fetchers.py` 把 `tests/test_fetchers.py` 的罐头 payload 原样搬来跑 Python parse，生成 `fixtures/golden-fetchers.json`（36 个 parse 用例）+ `fixtures/golden-config.json`（PyYAML 解析 `config.example.yaml` 的结果）；TS 57 个测试全过，含 YAML 输出与 PyYAML 逐项 deep equal。② 实网双跑（2026-11-15 晚，沙箱目录、示例配置、两边间隔约 25 分钟）：25 源中 24 个 status 一致（x 两边均 missing），21 源条数与 URL 集合 100% 一致，共振组 60=60、vocab 基线 270=270、sitemaps 基线逐站一致（仅 glama +8 为活数据增长）；差异均为活数据漂移或外部限流——civitai/producthunt 最新流在间隔内滚动（重合 0.80）、google_news 轮换 1 条（0.97）、app_store 两边走通的端点不同（主端点 vs legacy 回退，重合 0.56，两边条数都是 50）、reddit 在第三次扫描时被未登录限流打成 missing（单独跑 Node 版为 ok 30 条，走通的子版与 Python 那次不同，总数一致）。
- **双跑中修掉一个真 bug**：Node 侧对非 2xx 响应未读 body 就抛错会让 undici 在 keep-alive 连接上触发内部断言、直接崩进程（Reddit 403 页触发）；`fetchBytes` 改为先排空 error body 再抛 FetchError（与 urllib 读完才报错的行为一致）。
- 根 `package.json` 与 workspace 版本升 0.17.0，根 test/build 脚本串联 core + fetchers（npm test 共 166 个全过）；Python `pytest` 仍 52 全过。

## 0.16.0 — 2026-11-15（未发布，Node 迁移 Phase 0 + 1）

- **Node / TypeScript 迁移开工（开工单 `NODE-MIGRATION.md`）**：仓库改为 npm workspaces monorepo（根 `package.json` + `tsconfig.base.json`），Python 引擎原样保留、不改行为，直到对应 Phase 对等验证通过。
- **Phase 0 黄金样本**：新增 `scripts/make_golden.py`，对固定输入集跑 Python 待迁纯函数，生成 `packages/core/fixtures/golden.json`——覆盖 heat / classify / slugify / title_keywords / 两种 tokens / topic_weights / item_time / apply_controls / resonance / store / vocab / topic_key / build_topics + topics_data + alerts_data 全链（ED1/ED2 + 新增 ED3 制造 surge 与 resonance）/ parse_track_record，含中英日标题、CJK slug 与超长截断、同 token 超 12 条、排序截断等边界；脚本可重复运行、结果确定。
- **Phase 1 `@breaker-delta/core`**：纯领域逻辑迁 TS（strict、零运行时依赖、测试用 node:test）——`heatOf` / `classify` / `slugify` / `titleKeywords` / `topicFile` / `scanTokens` + `publishTokens` / `resonanceGroups` / `topicWeights` / `itemTime` / `applyControls` / store 全部 / `applyVocab`（存储可注入）/ `topicKey` / `buildTopics` / `parseTrackRecord` / `topicsData` / `alertsData`，行为与 Python 逐项对等、怪癖保留（双 tokens、classify 先 title 后 body、slug 48 字截断、alerts 新话题只报 resonance 等）。TS 测试逐项比对 golden + 独立单元断言，共 109 个全过；Python 侧 `pytest` 50 过（另 2 个 track-record 测试为 0.15.1 数据分仓后的既有失败，与本次无关）。

## 0.15.1 — 2026-11-15

- **数据与引擎正式分仓**：实例数据（`editions/` 5 期、`state/seen-topics.json`、`seen-topics.md`、`track-record.md`）已迁入数据仓 `daiyanze/breaker-delta-data` 并删除本仓副本（数据仓副本与删除前本地文件哈希逐一核对一致）。线上站点改由数据仓 CI 构建部署：https://daiyanze.github.io/breaker-delta-data/
- 本仓 Pages 改为跳转页：`.github/workflows/pages.yml` 只部署一个跳转到新地址的 index.html，不再用本仓数据构建站点。今后扫描与期次写入只进数据仓。

## 0.15.0 — 2026-11-15

- **数据 / 引擎分仓准备（Dai 定：数据归用户自己的数据仓，引擎仓不放收集数据）**：
  - **实例地址可配**：`radar/publish.py` 的站点基址改为可用环境变量 `TS_BASE_URL` 覆盖（默认不变，仍为 `https://daiyanze.github.io/breaker-delta/`）；投苗页的 GitHub Issue 目标仓改为可用 `TS_DATA_REPO` 覆盖（默认仍为 `daiyanze/breaker-delta`）。数据仓 CI 用这两个变量把同一套引擎构建到实例自己的地址、把投苗收进实例自己的仓库。新增测试断言两个覆盖都生效。
  - **扩展源码入仓**：浏览器扩展（原独立目录 `breaker-delta-extension/`）纳入本仓 `extension/`，作为其正式存放地。其 `data/topics.json`、`data/alerts.json` 是实例数据、**不入仓**：`extension/data/` 只留 README（说明从构建产物或已发布站点复制）和 `.gitignore`，打包时由 CI 从实例数据注入。
  - **数据仓已在本地建好**：`breaker-delta-data`（Dai 的实例数据仓）含 editions、state 台账、战绩台账、投苗模板与薄 CI workflow（拉取引擎 → 覆盖数据 → 构建 → 部署到该仓自己的 Pages）。本版本只做准备：**引擎仓内的数据文件暂不删除**，等数据仓上线并验证一致后再删。

## 0.14.0 — 2026-11-15

- **免费信息源第二波扩容**：把实测可用的免 key 源全部接完。official_blogs 新增 6 个（Google Blog、Ollama Blog、Databricks Blog、Cloudflare Blog、GitHub Changelog、Mozilla Blog），tech_media 新增 5 个（SemiAnalysis、One Useful Thing、Platformer、YC Blog、LessWrong）；新增三个抓取组——`gh_releases`（L1，GitHub Releases 观察组：llama.cpp / vLLM / Claude Code，整组算一源）、`federal_register`（L1，美国联邦公告 API，免 key，政策与监管的一手文本）、`stackexchange`（L2，全站热门问题 Atom，免 key）。配置（YAML/JSON 双份）、抓取器默认列表、站点域名映射与归组提示同步更新。实测：official_blogs 候选 55 → 85，tech_media 55 → 80，新组分别返回 15 / 10 / 20 条，零 feed 失败；全套 51 个测试通过。
- **新增仓库文档 `SOURCES.md`**：自带信息源的完整目录（26 个抓取组，L1/L2/L3 分层、每个 feed 的地址与每个源的判定口径），与站点「数据源」页（实际贡献过话题的源与战绩）分工。

## 0.13.1 — 2026-11-15

- **alerts 的 surge 口径收紧（Dai 定）**：`data/alerts.json` 的 surge 只针对已有话题（上一时间点已在榜、浪高涨幅 ≥30）；新上榜话题只报 resonance，不再同时产生一条 surge。此口径与涨潮榜不同（涨潮榜仍按新上榜全浪高计涨幅）。本期回放：alerts 由 9 条变为 4 条（全部 resonance，本期无已有话题涨幅 ≥30）。扩展快照同步更新，扩展版本 0.2.1（角标随之变为 4）。

## 0.13.0 — 2026-11-15

- **🏆 战绩页（E1）**：新增 `track-record.html`（导航位于数据源与归档之间，zh/en/ja 三语同步）。页面由仓库根目录的 `track-record.md` 在构建时解析生成——台账仍是人工维护的唯一数据源，不另写一份数据。含总览数字（已登记 24 条 / 已复核 0 条；首批复核 2026-11-25，未到期不计算命中率）、判定标准（命中 / 未命中 / 话题弧合并 / 事实核查优先）与按期次分组的完整台账表（级别 / 话题 / 复核标准 / 复核日 / 结果，空白显示「待复核」）。
- **🌱 网页投苗（A4）**：新增 `submit.html`（三语；从苗头页与关于页链入，不占导航）。说明什么算好苗头（单源 / 新 / 有一手链接 / 一句话理由）；投递走 GitHub Issue 预填链接（标题 / 链接 / 理由），仓库新增 `.github/ISSUE_TEMPLATE/seed.md` 模板；页面带书签小工具（bookmarklet），在任意页面点击即带着标题 + 链接打开投苗页，页内脚本把参数渲染成与浏览器扩展导出口径一致的「标题 / 链接 / 理由」可复制文本块。
- **静态数据层（C1 / G3-lite）**：构建时在站点根目录生成 `data/topics.json`（全部当前话题：slug / 标题 / 浪高 / 首现 / 等级 / 由原文链接派生的 url_patterns / 由标题派生的 title_keywords）与 `data/alerts.json`（最新一期的破圈提醒：共振 = 最新一期首现且 ≥2 个独立来源； surge = 相对上一时间点的浪高涨幅 ≥30，口径同涨潮榜；每条带 slug+reason+edition 去重键，确定性生成、无重复）。浏览器扩展 0.2.0 起改用这份真实快照数据。

## 0.12.0 — 2026-11-15

- **第一档新源接入（均为实测可用后才收）**：official_blogs 增加 **LangChain Blog**（Agent 框架一手动态）；tech_media 增加 **Interconnects**（Nathan Lambert，模型发布解读）、**Ahead of AI**（Sebastian Raschka，论文/模型深读）、**Dwarkesh Podcast**（长访谈）。配置（YAML/JSON 双份）、抓取器默认列表、站点域名映射与归组提示同步更新。实测：official_blogs 候选 50 → 55，tech_media 40 → 55，四个新 feed 各出满单源上限 5 条。

## 0.11.0 — 2026-11-15

- **AIHOT 示范信源补齐**：对照 KKKKhazix/AIHOT 开源仓库的 `industry/sources.json`（18 个示范源）逐项核对——其中 17 个已在 0.3.0 源扩展时集成（official_blogs 的 OpenAI/DeepMind/Google Research/Hugging Face/Mistral/NVIDIA/AWS/GitHub/BAIR 与 tech_media 全部 8 个，地址逐字一致）；本次补上唯一缺口 **Microsoft Research**（`microsoft.com/en-us/research/feed/`），加入 official_blogs 配置（YAML/JSON 双份）、抓取器默认列表与站点域名映射。实测抓取器当场返回该源 5 条候选（组上限）。

## 0.10.0 — 2026-11-15

- **话题页 detail 区留白加大**（正文行高 1.85、段间距、原文链接区上边距）；删除正文下方的数据源胶囊标签（与历史表的数据源列重复）。
- **期次时间改常规格式**：全站期次标签由「11-14 早报」改为标准时间「2026-11-14 06:00」（滑块刻度、历史表、归档、数据源页同步）；刻度最小宽度随之放宽到 118px。
- **数据源列表的 config 默认折叠**：点击「⚙️ config · <组名>」展开 YAML 原文；详情页仍直接展开。
- **滑块日期轴留白加大**：时间轴上下边距与刻度标签间距提升。
- **创作参考 v2（按公开写作 skills 重做）**：短贴——钩子三选一（数字型 / 好奇缺口 / 信号型，按 tweet-writer 的钩子公式用话题数据生成）+ PAS 正文骨架 + 短贴 tips；长文——Hormozi 四段骨架（一个观点 → 故事与证据（含浪高轨迹）→ 理由不是步骤 → 软 CTA）+ Dan Koe 节奏等长文 tips。面板右上角标注框架来源。

## 0.9.1 — 2026-11-15

- **创作参考面板改为构建可选项**：`TS_CREATOR=0` 时话题页不生成「创作参考」面板（短贴/长文大纲 + tips）；默认开启。

## 0.9.0 — 2026-11-15

- **数据源详情页**：每个数据源有独立页面（`source-<slug>.html`）——统计、设置文件原文配置、它贡献的全部话题（带出现次数与最近出现期次）。数据源列表里源名改链到详情页（原站链接保留为 ↗）；话题页历史表里的数据源名也全部链到对应详情页。
- **config 改为设置原文展示**：列表与详情页直接展示设置文件（`config.yaml` / `config.example.yaml`）里该源所属抓取组的 YAML 原文，不再做二次概括。
- **话题页新增「创作参考」**：按每个话题自身数据生成的短贴大纲（钩子 / 核心事实 / 为什么重要 / 数据 / 出处）与长文大纲（标题 / 导语 / 事件时间线 / 关键细节 / 影响与判断 / 后续观察 / 出处），加一组写作 tips。
- **辅助说明可折叠**：海浪榜、涨潮榜、话题页加了「浪高是怎么计算的？」折叠说明（公式、共振与结转规则），默认收起，点击展开。
- **话题页留白**：section 间距加大，历史表单元格 padding 与行高提升，信息不再挤在一起。

## 0.8.0 — 2026-11-15

- **数据源显示各自的 config**：每个数据源下方以小 chips 展示它在 `config.json` / `config.example.json` 中的配置——所在层级（L1 源头 / L2 发酵 / L3 验证）、启用状态、每源条数上限、阈值（如 GitHub 的日均 ★ ≥ 200），并附配置里的判定规则原文。
- **标签页带标签组**：分类页与每个标签页（分类 / 等级）顶部都显示完整标签组，当前聚焦的标签高亮显示。
- **涨潮榜规则修正**：涨幅 = 与上一时间点的全榜状态相比的浪高变化；新上榜话题按其全部浪高计入涨幅（从无到有）。此前旧话题恰逢普遍回落、新话题又被排除在外时榜单会空白；现在无上涨时显示明确的空榜说明。
- **全站列表分页补齐**：归档按日期分页（默认每页 7 个日期，`TS_ARCHIVE_DAYS` 可调）；数据源每页 20 个（`TS_SOURCES_PAGE` 可调）；涨潮榜、苗头、分类页、等级页改用与海浪榜相同的每页条数（`TS_PAGE_SIZE`，默认 100）。修复：海浪榜时间滑块切换时的话题行里，分类标签现在也是可点链接。

## 0.7.0 — 2026-11-15

- **话题 URL 改为标题 slug**：`topic-t07.html` → 如 `anthropic-ipo-定价区间出炉.html`（取话题首次出现时的标题生成，之后标题再变 URL 不变；冲突自动加序号）；旧 `topic-t**` 地址保留跳转存根（noindex + canonical 指向新址）。
- **海浪图改 area chart**：渐变面积填充 + 折线；数据点压到绘图区左侧 2/3（黄金分割位置），右侧留白。
- **标签页**：每个分类（`category-<key>.html`）与每个等级（`level-must/watch/seed.html`）各有独立列表页；分类页顶部加标签索引（分类 + 等级 + 计数），列表行与话题页上的分类/等级标签全部可点。
- **分享按钮**：默认改为国际平台（X / Facebook / LinkedIn / Telegram / Reddit / Email / 复制链接），全部带平台图标；构建时可用 `TS_SHARE` 自定义平台组合（如 `TS_SHARE=x,telegram,weibo,copy`）。
- **话题页原文链接直接展开显示**，不再折叠在 accordion 里。
- **往期归档按日期分组**，同日内按时间倒序（晚报在前）。

## 0.6.1 — 2026-11-15

- **移动端适配**：新增 720px 以下响应式规则——列表行改两行排布（第一行排名+标题+浪高，第二行分类/时间/来源图标），导航标签横向滑动，页眉控件自动换行，话题页历史表横向滚动，海浪图本身为 viewBox 自适应宽度。

## 0.6.0 — 2026-11-15

- **站点生成器整体换代（v3「浪尖雷达」上线）**：`radar/publish.py` 重写为多页线框站——🌊 海浪榜（可拖动时间滑块，JSON 驱动、最近 60 个时间点）/ 📈 涨潮榜 / 🌱 苗头 / 🗂️ 分类 / 📡 数据源 / 📚 归档 / ℹ️ 关于，外加每话题独立页（海浪图走势 + 历史表 + 分享按钮 + nofollow 原文链接）与期次快照页。
- **浪高 v2**（参考 AIHOT、不设上限）：基分 must 60 / watch 30 / seed 10 + 共振 20×源数 + 证据 8×链接数 + 首现 25；榜单按时间点全量计算，未更新话题按最近浪高结转。列表行带 24h 小浪高图、当前/上次排名与双增减、来源 favicon（构建时抓取并缓存校验）。
- **多语言与主题**：zh/en/ja 三套界面（话题标题正文为采集原文不译），语言集由 `TS_LANGS` 构建设置决定，切换入口仅在语言数 >2 时显示；dark/light 主题切换（localStorage 持久化）。
- **SEO/GEO/OG 全套**：逐页 meta description + canonical + hreflang、OG/Twitter 卡片、NewsArticle/WebSite JSON-LD、sitemap.xml / robots.txt / llms.txt、RSS + Atom（按语言各一份）。
- `publish.build(base_url, out_dir, editions_dir)` 保持可测接口，`tests/test_publish.py` 按新产物契约重写；Pages 工作流触发路径补 `assets/**`。

## 0.5.1 — 2026-11-13

- 项目改名 **tripple-signals → triple-sigma**（仓库由 Dai 在 GitHub Settings 改名，旧地址自动重定向；token 按仓库 ID 授权，不受影响）：仓库内全部标识同步更换——README/ROADMAP、plugin 与技能目录 `skills/triple-sigma`、MCP server 名、抓取器 User-Agent、pyproject 包名、横幅 SVG/PNG 的字标、站点标题与 feed 标题。历史条目与期次内容不改。
- 站点 canonical 地址改回 `https://daiyanze.github.io/triple-sigma`：daiyanze.com 的 DNS 在 Cloudflare（个人站），GitHub 账号侧残留的同名自定义域名配置会把 github.io 的访问重定向过去并 404；该残留配置的清理（或改用子域名）待 Dai 决定，见仓库设置说明。

## 0.5.0 — 2026-11-13

继续借鉴 new-term-radar 还没借的三件（其付费部分——AIsa 链接图谱、DataForSEO 关键词量——不借）：

- **新词词汇表**（`radar/vocab.py`）：new-term-radar 的核心机制是维护滚动词汇表、只认「第一次被说出口」的名字。本仓库没有 X 火箭筒，改为落在实体型源上（GitHub / HF / HF Spaces / OpenRouter / Civitai / Product Hunt / 目录站 / App Store）：名字在 `vocab.window_days`（默认 60）内没在候选流出现过 → 候选打 `"novel": true`，状态存 `state/vocab.json`。第一次运行只建基线、不打标。实测：基线 268 个名字，第二轮即标出 2 个新名字（OpenRouter 新模型、Product Hunt 新品）。
- **sitemap 快照 diff**：从「lastmod 时间窗口」改为快照比对（`state/sitemap-seen.json` 按目录留档全部见过的工具页 URL，90 天未现自动遗忘），只报新 URL，同一工具永不重复播报。第一次运行每个目录只建基线（note 里列出各目录基线量）。实测 12 家基线共约 6 万个 URL；对照实验中人为从快照删掉的 3 个 URL 被精确地作为新条目报回。
- **目录站 3 → 12 家**：新增 Glama、mcp.so、LobeHub MCP、LobeHub Skills、Aixploria、OpenTools、Clipfly、aitoptools、ai-bot.cn（逐个实测结构后定 pattern）。索引分片解析泛化：支持多组 shard_patterns（Glama 的 servers + remote-servers）、非数字分片按文档顺序（OpenTools 的命名分片）、`?section=…&page=N` 分页（mcp.so）。顺带修三个实测发现的问题：无时区 lastmod 与带时区的混排会崩（已统一补 UTC 并加回归测试）；Toolify 最新分片含多语言路径（`/de/tool/…`）导致同一工具多语言重复（pattern 改锚定域名，与 LobeHub 的处理一致）；slug 里的百分号编码统一解码再生成名字。
- 注意：升级后第一次扫描，sitemap 组不出条目（建基线）、vocab 不打标，属预期行为，报告 note 与候选文件里都有说明。测试增至 44 个，全过。

## 0.4.0 — 2026-11-13

- 配置迁 YAML：新增 `config.example.yaml`（带注释），加载顺序 config.yaml > config.yml > config.json > config.example.*，旧 JSON 配置照常可读；`config.example.json` 改为由 YAML 生成的镜像（文件内有标注）。解析优先用 PyYAML（装了的话），否则用内置子集解析器 `radar/yamlmini.py`——零依赖不变，两个解析器对示例配置的输出经测试逐字节一致（结构相等）。
- 用户可控选项（抓取后、共振分组前由代码执行，分级仍归 agent）：`keywords.mute` 屏蔽词（命中丢弃）、`keywords.boost` 关注词（打标，单源可升一级）、`keywords.alert` 必看词（打标并汇入候选文件 `keyword_alerts`）；`topics` 主题权重（取代平铺的相关性列表，旧写法兼容）；每源 `enabled: false` 关源（状态单列 disabled，不算缺失、不补扫）与 `max_items` 抓后截断（避开与各源既有 `limit` 抓取参数重名）；`filters.max_age_hours` 新鲜度窗口（只过滤带可解析时间戳的候选）。
- 一键 CLI：`python -m radar` 无参即扫描（按本地钟点自动选期次），`scan --edition` 改为可选；新增 `pyproject.toml`，`pip install -e .` 后可用 `radar` 命令（零依赖）。`--config` 在子命令前后均可传。
- 实测演示（临时配置）：mute/boost/alert + max_age_hours=72 + 关 Civitai + arXiv max_items=5 一轮跑通——stale 丢弃 94 条、boost 打标 3 条、alert 命中 22 条（Gemini 发布周）、关源与截断均按预期生效。测试增至 38 个，全过。

## 0.3.1 — 2026-11-13

- 新增 3 个英文免费源（22 个源，21 个免 key）：HF Daily Papers（L1，HF 社区票选论文，arXiv 的已筛选版）、Bluesky（L1，配置账号的公开 RSS——搜索 API 要鉴权，账号 RSS 是免 key 的路；默认 7 个账号均逐个实测有帖才收录，含 Simon Willison、Karpathy、Greg Brockman 与 4 家媒体）、Wikipedia 热读榜（L2，英文维基昨日浏览 Top，过滤元页面；大众注意力确认 + 社会观察供稿）。
- 本轮按使用者选择只接英文源：实测可用的中文源（Bilibili 热门、V2EX、少数派）暂不接，记录在方法论第八节。
- 测试增至 31 个，全过；实测 22 个源 21 个出数，仅 X 缺失。

## 0.3.0 — 2026-11-13

- 信息源从 7 个扩到 19 个，新增 12 个抓取器，全部免费、免 key（参考 new-term-radar 与 AIHOT 的信源设计，逐个实测可用后才接）：
  - L1 新增：官方博客 RSS 组（9 家实验室/公司，仿 AIHOT 的 T1 分级）、Show HN、HF Spaces、OpenRouter 最新模型、Civitai 最新模型、arXiv 最新论文。
  - L2 新增：科技媒体 RSS 组（5 家媒体 + 3 位独立作者，AIHOT 的 T2 分级）、DEV、Lobsters、Mastodon 趋势、目录站 sitemap 组（Futurepedia/Toolify/dang.ai，借鉴 new-term-radar 的 sitemap 信号）、App Store 美区双榜。
  - Product Hunt 不再依赖 token：无 token 时走公开 Atom feed（无票数，结果里注明）。
- 防假共振：RSS 组与 sitemap 组整组只算 1 个源（方法论与 SKILL 同步写明）。
- 共振分组降噪：停用词扩充（英文虚词与泛动词）、单 token 条目上限 12、按源数排序后只保留最强的 60 组——候选约 600 条时 junk 组从 292 降到可用量级。
- 健壮性：common 层透明解 gzip（DeepMind 的 feed 按 UA 返回 gzip 导致解析失败，已修）；App Store 营销工具接口 502 时自动降级旧版 iTunes feed。
- 实测（2026-11-13）：19 个源 18 个实时出数，仅 X 缺失（无 token，仍由 agent 网页扫补位）；测试从 13 增至 28 个，全过。
- 没接的（实测不可用，记录在方法论第八节）：Stack Exchange API（出口 IP 被限流）、Bluesky 公开搜索（403）、Microsoft Research RSS（403）。
- 顺手清掉 plugin.json 描述里写死的 "Twice-daily"（频度由使用者定义，不写进产品文案）。

## 0.2.1 — 2026-11-12

- Renamed the project from hot-news-radar to tripple-signals: repository, plugin name, skill folder (`skills/tripple-signals/`), MCP server name and fetcher user-agent now all carry the new name. No behaviour changes.

## 0.2.0 — 2026-11-12

- 抓取层落地：`radar/fetchers/`（GitHub 爆发仓+Trending、HN、Hugging Face、Reddit JSON/RSS、Google News RSS 为实抓；Product Hunt 与 X 需 token，未配置时如实报缺失、由 agent 网页扫补位）。
- `python -m radar scan --edition morning|evening`：跑全部抓取器，候选写入 `state/candidates-<日期>-<期次>.json`，附初步跨源共振分组（只提示可能性，分级仍归 agent）。
- MCP server 从占位变成最小可用实现（stdio、仅标准库）：`radar_scan` / `radar_review` 两个工具，冒烟测试通过。
- 测试增至 13 个（解析函数 + 存储），全部通过；实测 scan：7 个源中 5 个实时出数。

## 0.1.0 — 2026-11-11

- 骨架：方法论（methodology.md）、agent 指令（skills/hot-news-radar/SKILL.md）、配置示例、状态存储（radar/store.py）、14 天复盘 CLI、GitHub Actions 骨架。
- 未包含：各信息源抓取器、MCP server 实现（见 README 路线图）。
