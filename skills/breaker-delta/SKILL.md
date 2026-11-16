---
name: breaker-delta
description: Run one edition of the Breaker Delta web hot-topic radar — scan layered sources with the CLI, judge signals against fixed thresholds, dedupe against the topic store, and emit the report in the fixed format. (First-time instance setup lives in the separate breaker-delta-setup skill; this skill assumes a config already exists.)
---

# Breaker Delta（浪尖雷达）— 执行指令

完整方法论在仓库根目录 `methodology.md`。本文件是可执行版：照步骤跑，不要自由发挥结构。

## 输入

- **命令行**：单文件版 Breaker Delta CLI（仓库 `apps/cli/dist/breaker-delta.mjs`，只需 Bun ≥ 1.2），下文记作 `$BD_CLI`，即 `bun /path/to/breaker-delta.mjs`（把路径换成本机实际路径）。所有命令都显式带 `--data-dir <数据目录>`（或设环境变量 `BD_DATA_DIR`）；数据目录里放该实例的 `editions/`、`state/`、`track-record.md` 与配置。
- `config.yaml`（兼容 `config.json`，在数据目录里；都没有就用引擎侧的 `config.example.yaml`）：信息源、门槛、关键词、期次、时区都在里面，**不要把门槛硬编码在脑子里**。config 里写了 `preset: <名字>` 时，引擎侧 `presets/<名字>/config.yaml` 是基础层（整套行业订阅：源、权重、分类体系），实例 config 的同名顶层段覆盖它；话题的分类体系在 preset 的 `categories` 段，由发布器自动套用，agent 不要手工给单条话题改分类——觉得分类不对，改的是规则。
- **插件（Plugin-P0）**：有效 config 的 `plugins:` 段决定本实例启用哪些话题页面板插件（分层同 preset：preset 默认 ← 实例 config）。插件包在引擎侧 `plugins/<id>/`，数据目录的 `plugins/<id>/` 同 id 覆盖。带 `schema.yaml` 的是数据插件（investor 投资研判、watchlist 追番建议）：分级时要按它的 `prompt.md` + `schema.yaml` 给入选话题多产出一份结构化研判，写进期次条目的 `plugins` 字段（见步骤 5c）。creator 没有 schema，不需要产出，面板由发布器用话题自身数据拼装。
- `<数据目录>/state/seen-topics.json`：话题台账。先读，再扫。
- 期次：名字、时间与分工都在 config 的 `editions` 段里（官方实例是 morning 06:00 / evening 18:00 JST，那只是它自己的设置，不要当成固定频次套到别的实例上）。

常用命令（细节看 `$BD_CLI --help`）：

- 抓取：`$BD_CLI --data-dir <数据目录> scan --edition <morning|evening>`（省略 `--edition` 时按本地小时自动选期次）
- 写回台账：`$BD_CLI --data-dir <数据目录> record <entries.json>`（输入格式见步骤 5）
- 到期复核清单：`$BD_CLI --data-dir <数据目录> review`；回填复核结果：`$BD_CLI --data-dir <数据目录> record review --name <话题> --result hit|miss`
- 构建站点：`$BD_CLI --data-dir <数据目录> publish`
- 环境自检：`$BD_CLI --data-dir <数据目录> doctor`

## 步骤

0. **先跑抓取层**（数据目录还没有可用 config 时，不要直接开扫——先用 `breaker-delta-setup` 向导 Skill 把这个实例配置好，再回来跑本流程）：`$BD_CLI --data-dir <数据目录> scan --edition <morning|evening>`（或省略 `--edition` 自动选期次），读它写出的 `<数据目录>/state/candidates-<日期>-<期次>.json` 作为候选底稿；状态为 missing 的源（通常只有 X，以及当期失败的源）再用网页扫补齐，并在报告里如实标注哪些源是代码抓的、哪些是网页扫的。状态为 disabled 的源是用户在 config 里关掉的，**不算缺失、不要补扫**，报告也不必提。
1. **按层扫源**（顺序不可颠倒，这是方法论的核心）：
   - L1 源头层：X（Trending + config 中账号的新名字）、官方博客组（实验室一手公告）、GitHub（Trending + 爆发仓库）、Hacker News（首页/高分新帖）、Show HN（发布帖）、Hugging Face models + HF Spaces（Trending 前 50 新面孔）、OpenRouter（最新上架模型）、Civitai（最新社区模型）、arXiv（最新论文）、HF Daily Papers（社区票选论文）、Bluesky（config 账号的公开 RSS）、Product Hunt（当日新品）。
   - L2 发酵层：Reddit（config 的版块，rising/热帖；留意 “is there a tool that…” 式需求）、科技媒体组（媒体 + 独立作者）、DEV、Lobsters、Mastodon 趋势（当日独立账号数）、Wikipedia 热读榜（大众注意力/社会观察）、目录站 sitemap 组（新工具页）、App Store 榜单（钱信号）、Google News（科技/AI 头条）。
   - **组源计 1**：官方博客组、科技媒体组、sitemap 组在数共振时各只算一个源——组内多家转述同一件事不算共振。
   - L3 验证层：Google Trends **只**核对已入选话题的曲线，禁止用它发现话题。
   - 某个源查不到：记入报告「本期缺失」，禁止用其他源内容冒充。
2. **判定信号**（用 config 的门槛）：
   - 候选文件已过用户控制层：屏蔽词命中的已被代码丢弃（`controls.muted` 是丢弃数）；带 `keyword_hits.alert` 的候选汇在 `keyword_alerts` 里，带 `keyword_hits.boost` 的是用户关注词命中，带 `topic_hits` 的附主题权重——分级时按下面第 3 步用。
   - 带 `"novel": true` 的候选（0.5.0）：实体型源里这个名字在词汇表窗口（默认 60 天）内第一次出现，是优先级最高的回波信号，单源也优先核查；候选文件顶层 `vocab` 字段是本轮统计（`baseline: true` 表示第一次运行只建了基线、本轮无 novel 可用）。目录站 sitemap 组已改快照 diff：条目都是上次扫描后新收录的页，不会重复出现；某个目录第一次运行只建基线（note 里会写），不出条目是正常现象。
   - 同一话题 ≥ `min_sources_for_hotspot` 个独立源 = 热点候选；单源 = 回波。
   - GitHub：年龄与 stars 增速按 config 的 github 规则；X：按 config 的 x 规则；HN/Reddit：进首页/rising 前列。
   - 只保留「具体的新东西」（新模型/产品/仓库/事件名）；泛词（dashboard、pricing 之类）一律丢弃。
3. **打分分级**：共振度、增速（对比台账里上次等级）、新鲜度、相关性（按 config `topics` 的权重，候选的 `topic_hits` 已算好）→ 🔥必看 / 👀关注 / 🌀回波。用户控制的升降级：`alert` 命中且有第二源共振 → 直接列 🔥必看候选；`boost` 命中的单源话题可由 🌀升为 👀。全期最多 `max_items_per_report` 条，回波最多 `max_echoes` 条。
4. **去重**：台账里已有的话题不重复介绍背景，只报状态变化（升级/降温/消亡）；新话题标 🆕。
5. **写回状态**：每条入选话题用 CLI 的 `record` 命令更新台账（首次发现时间、来源、等级轨迹）：把入选话题写成 JSON 数组存成文件，再跑 `$BD_CLI --data-dir <数据目录> record <文件>`；每条格式为 `{"name": "话题名", "sources": ["Hacker News", "Reddit"], "grade": "must"}`，grade 用台账的等级键（`must` = 🔥必看、`watch` = 👀关注、`echo` = 🌀回波）。
5b. **写期次文件（三语）**：期次 JSON 写到数据仓 `editions/` 时，每条 item 除主语言（中文）`title`/`body`/`action` 外，必须带 `i18n`，含 `en` 与 `ja` 两套同结构译文：`"i18n": {"en": {"title": "…", "body": "…", "action": "…"}, "ja": {"title": "…", "body": "…", "action": "…"}}`；期次顶层若有 `title`，同样带顶层 `i18n`（`{"en": {"title": "…"}, "ja": {"title": "…"}}`，期次名按站内惯例：en 用 `Breaker Delta · Morning / Evening`，ja 用 `浪尖レーダー · 朝刊 / 夕刊`。译文要求：数字、日期、价格、版本号、专名与原文逐项对齐，不增删信息；标题保持同样的力度与长度感，专名保留原形。主语言字段是唯一原件——认话题、算浪高、生成 slug 都只看主语言，译文只供发布器在构建 en/ja 站点时取用。写完逐条自检：en/ja 的 `title`/`body` 非空、`action` 与原文同有同无；缺一条先补齐再出报告，不许靠发布器的缺译回退兜底（回退只保证构建不坏，不保证质量）。
5c. **插件分级注入（启用了数据插件才做）**：写期次文件时，对每个已启用的数据插件（有 `schema.yaml` 的），先读它的 `prompt.md`（判断口径与红线）和 `schema.yaml`（字段定义），再对入选话题逐个判断：
   - **范围照 prompt.md 定**（如 investor 只对 🔥必看 / 👀关注产出；watchlist 只对话题指向的具体作品产出）。不在范围的话题不产出——不要为了凑满而硬写。
   - 产出写进该条目的 `plugins` 字段：`"plugins": {"investor": {"direction": "利好", "tickers": ["NVDA 英伟达"], "horizon": "季度", "logic": "…", "risks": "…"}}`。字段名、枚举值必须与 schema 逐字一致；列表型字段给数组。
   - **必填字段缺一不可**：某个话题凑不齐必填字段（比如找不到明确标的又写不出逻辑），就整份不产出（该条目不带这个插件的键）——发布器没数据就不渲染面板，半成品比没有更糟。
   - **不编造**：标的、作品、状态都必须有本期信源支撑；关联弱、拿不准的按 prompt 口径写「不明」或不产出。研判字段用实例主语言写（三语站点同显，与台账正文口径一致）。
   - 免责声明由发布器按插件声明强制渲染，**不要**把免责文字写进任何字段。
6. **出报告**：严格用下方模板。每个数字必须带出处；禁止「爆火」「刷屏」等无量词形容；建议动作只给判断，不替用户做决定。

## 报告模板

```
📰 热点雷达 · {早报|晚报} {YYYY-MM-DD} {HH:MM} JST

🔥 必看（n 条）
1. {话题一句话} — {为什么热，带关键数字}
   来源：{源列表}（附链接）
   建议动作：写 tweet / 深入研究 / 立项观察 / 仅记录

👀 关注（n 条）
（同上格式）

🌀 回波（n 条）
- {话题} — {单源信号一句话}

📈 今日变化（仅晚报）
- {老话题}：{涨/平/凉 + 依据}

⚠️ 本期缺失：{查不到的源，没有就写「无」}
```

## 红线

- 只读公开信息；不发帖、不点赞、不互动。
- 不编造数字、链接、账号动态；没查到就写缺失。
- 不改 `config.json` 和门槛来「凑」结果；觉得门槛不合理，在报告末尾提一句建议即可。
