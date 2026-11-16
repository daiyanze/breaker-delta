---
name: breaker-delta
description: Run the Breaker Delta web hot-topic radar. If the instance has no config yet, first walk the user through the setup wizard (industry interview, category taxonomy, live-validated subscription sources, pilot edition, run-mode choice); otherwise scan layered sources with the CLI, judge signals against fixed thresholds, dedupe against the topic store, and emit the report in the fixed format.
---

# Breaker Delta（浪尖雷达）— 执行指令

完整方法论在仓库根目录 `methodology.md`。本文件是可执行版：照步骤跑，不要自由发挥结构。

## 输入

- **命令行**：单文件版 Breaker Delta CLI（仓库 `apps/cli/dist/breaker-delta.mjs`，只需 Bun ≥ 1.2），下文记作 `$BD_CLI`，即 `bun /path/to/breaker-delta.mjs`（把路径换成本机实际路径）。所有命令都显式带 `--data-dir <数据目录>`（或设环境变量 `BD_DATA_DIR`）；数据目录里放该实例的 `editions/`、`state/`、`track-record.md` 与配置。
- `config.yaml`（兼容 `config.json`，在数据目录里；都没有就用引擎侧的 `config.example.yaml`）：信息源、门槛、关键词、期次、时区都在里面，**不要把门槛硬编码在脑子里**。config 里写了 `preset: <名字>` 时，引擎侧 `presets/<名字>/config.yaml` 是基础层（整套行业订阅：源、权重、分类体系），实例 config 的同名顶层段覆盖它；话题的分类体系在 preset 的 `categories` 段，由发布器自动套用，agent 不要手工给单条话题改分类——觉得分类不对，改的是规则。
- `<数据目录>/state/seen-topics.json`：话题台账。先读，再扫。
- 期次：名字、时间与分工都在 config 的 `editions` 段里（官方实例是 morning 06:00 / evening 18:00 JST，那只是它自己的设置，不要当成固定频次套到别的实例上）。

常用命令（细节看 `$BD_CLI --help`）：

- 抓取：`$BD_CLI --data-dir <数据目录> scan --edition <morning|evening>`（省略 `--edition` 时按本地小时自动选期次）
- 写回台账：`$BD_CLI --data-dir <数据目录> record <entries.json>`（输入格式见步骤 5）
- 到期复核清单：`$BD_CLI --data-dir <数据目录> review`；回填复核结果：`$BD_CLI --data-dir <数据目录> record review --name <话题> --result hit|miss`
- 构建站点：`$BD_CLI --data-dir <数据目录> publish`
- 环境自检：`$BD_CLI --data-dir <数据目录> doctor`

## 首次运行向导（没有配置时先走这里）

### 什么时候进向导

- 跑 `$BD_CLI --data-dir <数据目录> doctor`，config 检查为 fail（数据目录和引擎侧都找不到 config），或数据目录里还没有 `editions/` 与 `state/` —— 首次运行，进向导。**向导没走完，不要跑下面的扫描步骤。**
- 用户明说「配置一个新雷达 / 换个行业 / 加订阅源 / 改分类」—— 进向导；已有配置的走 W7 增量模式，不从头再来。

### 通用规矩

- **一次问一组、先给草案**：每一步先拿出你的草案（分类表、源清单、关键词），用户不反对就按草案定。不要逐个字段盘问，也不要把 YAML 甩给用户让他自己填。
- **产物只写数据目录**：`config.yaml` 与 `brief.md` 都落数据目录。有引擎仓写权限且用户同意时，可另存一份到 `presets/<行业slug>/` 作为他的 preset；没有就跳过，不强求。
- **不编造订阅地址**：每个源必须按 W4 实测，测不过的当场说明原因，不静默收录、不拿别的源的内容冒充。
- **频次永远问用户**：一期还是两期、几点跑，都是用户定；官方实例的早晚两期只是例子。
- 向导是唯一允许**写** config 的场景（日常运行仍守「不改门槛凑结果」的红线）；写的是新配置，不是为某一期凑结果。

### W1 行业访谈（一轮问完）

问清五件事，用户没答的给默认并注明：① 盯哪个行业、哪个细分；② 读者是谁（自己看 / 给粉丝 / 团队内部）；③ 主语言，要不要同时出 en/ja；④ 时区；⑤ 希望多久一期、大概什么时间（可以到 W6 再定）。
从回答里提炼三样东西，后面几步都用：**行业名与 slug**、**3–5 个子领域词**（W3 权重与 W2 分类的种子）、**「什么算这个行业的大事」的一句话直觉**（写进 brief.md）。

### W2 分类共创

- 按行业常识 + 子领域词，拟 **5–8 个分类 + 1 个兜底类**：每个分类给 5–10 个关键词（这个行业标题里最常出现的词，记住分类是子串匹配、标题优先），以及 en/ja 显示名。
- 用表格呈现：`分类 | 关键词 | 一句说明`。用户增删改，**最多来回两轮就定稿**——分类准不准靠 W5 试跑校准，不要在这一桌上耗完。
- 定稿的分类就是 config 的 `categories` 段（`fallback` + `rules`，格式照 `presets/ai-tech/config.yaml` 末尾那段）。

### W3 关键词与主题权重

- `topics`：子领域词逐个给权重 2–5，用户最在意的方向给 5。
- `mute`：问「什么内容你永远不想再看到」，并给一份这个行业的常见垃圾词草案（招商、加盟、纯营销稿之类）供他勾选补充。
- `alert` / `boost`：问「哪类信号一出现必须第一时间知道」→ alert；其余关注词 → boost。
- 用户没有明确答案的就留空数组，不硬塞——这三件套后面随时能改。

### W4 订阅源发现与实测（最重要的一步，禁止跳过实测）

1. **按层列候选**：L1 源头层（行业的一手发布渠道：厂商/机构官方博客与公告、协会、监管原文、预印本与代码托管的行业区）、L2 发酵层（行业媒体、社区论坛、Newsletter、榜单与目录站）、L3 只核对（趋势类工具，只核对曲线、永不作为发现来源）。
2. **用户给的链接逐个处理**：先找 feed —— 页面 `<link rel="alternate">`、常见路径（`/feed`、`/rss`、`/atom.xml`、`/feed.xml`、`/sitemap.xml`）；再确认它落在引擎已支持的源类型里（照 `config.example.yaml` 的 `sources` 结构：RSS/Atom 组、sitemap 组与各专用源）。不在支持范围的站点，如实告诉用户「这个站暂时订阅不了」，写进 brief.md 的「待补订阅」清单，**不假装已订阅**。
3. **实测规程**：候选源先写入草稿 config，跑一次 `$BD_CLI --data-dir <数据目录> scan`，打开它写出的候选文件逐源核对：状态正常且有**近 7 天内**的条目 = 通过；报错、无条目、或只有过期条目 = 不通过，当场把原因告诉用户（无 feed / 已停更 / 抓不到），问要不要换替代源。**不通过的源从 config 里删掉再定稿，config 里不留死源。**
4. **数量参考**：L1 5–15 个、L2 5–10 个足够开局，宁缺毋滥；以后随时走 W7 加。

### W5 落盘 + 试跑一期

1. **落盘**：把 W2–W4 的结果补全进数据目录的 `config.yaml`（W4 实测用的草稿在此补齐；结构照 `config.example.yaml`：`language` / `timezone` / `editions` / `sources` / `keywords` / `topics` / `categories`）；`editions` 按 W1 问到的时间写（name/label/time/focus），用户没定就先写一期占位并说明随时可改。行业简报写数据目录 `brief.md`：读者是谁、什么算大事、分层直觉、分类口径、待补订阅清单（样子照 `presets/ai-tech/brief.md`）。跑 `doctor` 确认 config 检查 ok 再继续。
2. **试跑**：完整走一遍主流程（下面步骤 0–6）出一期试点，照常 `record` 入台账，再 `publish` 构建站点，把成品给用户看。
3. **摊开校准（至少留一轮）**：把本期每条的 `话题 → 分类 → 等级 → 来源数` 列给用户。用户指出分错类的，**改 `categories` 的关键词规则，不改单条结果**，重新 `publish`（不用重扫）再给他看；源太吵或太静的在这一轮一并调（关源、加 mute 词）。用户确认可以了，才进 W6。

### W6 运行模式（二选一，最后问一次）

- **A · 就在 agent 里跑（免部署）**：用当前 agent 环境的定时能力，按用户定的时间注册每期任务，任务内容就是本 Skill 的主流程、数据目录指向本实例；每期跑完在对话里按报告模板交报告。把注册好的时间表复述给用户确认，并提醒一句：agent 环境关机或休眠时不会跑，数据只存在本机数据目录。
- **B · 部署**：问 Docker 还是 Cloudflare（二选一，暂时只提供这两种），然后按部署文档分步引导（文档在文档站的部署页）；每步做完先验证（容器起来能打开榜单 / Worker 部署成功且第一期可见）再走下一步，需要用户出账号、密钥或去后台点的，当场说清要他做什么。部署细节以部署文档为准，不在本章展开。
- 之后想换模式随时回来重走 W6，配置不用重做。

### W7 增量重入（日常改配置的唯一通道）

- **加源**：新链接走 W4 的找 feed + 实测规程，通过才进 config；改完告诉用户结果（收了 / 没收及原因）。
- **改分类**（拆类、并类、改名、调关键词）：改 `categories` 规则后重新 `publish`，历史话题会按新规则重新归类；给用户看变化：原来各多少条、现在各多少条、哪几条换了类。
- **换行业**：重走 W1–W5 且用**新数据目录**——老台账和期次是旧行业的，不要在老目录上改。
- 任何增量改动之前，先把现有 config 复制一份 `config.bak-<日期>.yaml`，改坏了能回滚。

### 完成标准（结束向导前逐项自检）

- [ ] `doctor` 的 config 检查为 ok
- [ ] `config.yaml` 含非空 `categories`，且每个源都过了 W4 实测（用户明确接受的例外除外，并已告知）
- [ ] `brief.md` 已写入数据目录
- [ ] 试点一期已产出、给用户看过分类/等级清单，且留过至少一轮调整机会
- [ ] 运行模式已选：A 已注册定时并复述时间表 / B 已进入部署引导的第一步

## 步骤

0. **先跑抓取层**（数据目录还没有可用 config 时，先完整走上面的「首次运行向导」，不要直接开扫）：`$BD_CLI --data-dir <数据目录> scan --edition <morning|evening>`（或省略 `--edition` 自动选期次），读它写出的 `<数据目录>/state/candidates-<日期>-<期次>.json` 作为候选底稿；状态为 missing 的源（通常只有 X，以及当期失败的源）再用网页扫补齐，并在报告里如实标注哪些源是代码抓的、哪些是网页扫的。状态为 disabled 的源是用户在 config 里关掉的，**不算缺失、不要补扫**，报告也不必提。
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

---

# 附带职责：PR 检查与合并（PR Watch）

本章只在任务是「检查 / 处理 Pull Request」时执行，与上面的扫描流程无关。GitHub 自带的 Watch 只给人发通知、不会唤醒 agent；本章就是 agent 的固定巡检规程，换任何会话都照此执行，不凭记忆发挥。

## 范围与通道

- 仓库：`daiyanze/breaker-delta`（引擎仓）与 `daiyanze/breaker-delta-data`（数据仓）。
- 通道：`custom.github-token` 连接器的 `gh_api.py`（细粒度 token 已覆盖两仓）。读用 `get`；评论与合并用 `call` 子命令（`gh_api.py call POST /repos/<repo>/issues/<n>/comments --json '{"body":"..."}'`、`gh_api.py call PUT /repos/<repo>/pulls/<n>/merge --json '{"merge_method":"squash"}'`）。**禁止**使用已废弃的 `custom.github-pat`。
- 巡检节奏由外部定时任务决定（建议每 30–60 分钟或随早晚报各一次）；本章只规定每一轮怎么做。没有 open PR 时一轮即结束，只在被问到时汇报「无 PR」，不主动打扰。

## 每一轮的步骤

1. **列出**：对两仓分别 `GET /repos/<repo>/pulls?state=open`。逐条取详情：`GET /repos/<repo>/pulls/<n>`（看 `mergeable`、`draft`、标题、作者、目标分支）、`GET /repos/<repo>/pulls/<n>/files`（改动文件清单与增删行数）。检查状态用 `GET /repos/<repo>/actions/runs?head_sha=<head_sha>` 看该 head 的 workflow 运行结论——注意：当前细粒度 token 没有 Checks / Statuses 权限，`check-runs` 与 `commits/<sha>/status` 接口一律返回 403，**不要用**，也不要把 403 误判成「检查失败」；等 Dai 给 token 补了 Checks 只读权限后再切换。
2. **分档**（先看改动范围，再看检查状态）：
   - **A 档（可自动合并）**：必须同时满足——
     - 非 draft、无冲突（`mergeable` 为 true）；
     - 改动**只**落在数据/文档路径：数据仓的 `editions/`、`state/`、`track-record.md`、`seen-topics.md`、`README*`；引擎仓的 `*.md` 文档（不含 `.github/`、不含 `skills/`）；
     - 不碰 `.github/workflows/`、任何配置文件（`*.json` 数据文件除外）、密钥或凭据类文件；
     - 数据文件能通过基本校验：`editions/*.json`、`state/*.json` 可被 JSON 解析、结构与同目录既有文件一致；
     - 若该 PR 的 head 有 workflow 运行记录（`actions/runs?head_sha=`），必须全部 `conclusion: success`（两仓当前没有 PR 触发的 CI，只有数据/文档档允许在「无运行记录」时靠上一条本地校验放行；一旦将来加了 PR CI，此豁免自动失效，一律以 CI 为准）。
   - **B 档（只检查 + 汇报，绝不自动合并）**：任何代码改动（`packages/`、`apps/`、`scripts/`、`skills/`）、workflow 改动、配置改动、删除文件超过 5 个、总增删超过 1000 行、作者是首次贡献者、或 A 档任一条件不满足。B 档在 PR 下留一条评论：列出检查结论与不自动合并的原因，然后汇报给 Dai 等他决定。
   - **直接拦截并汇报**：改动里出现疑似密钥/令牌（`token`、`secret`、`.env`、私钥头）、把数据文件写进引擎仓（违反分仓原则）、或 PR 描述为空且改动范围说不清。只汇报，不评论细节、不合并。
3. **合并（仅 A 档）**：squash 合并（`merge_method: "squash"`，提交标题用 PR 标题）；合并后回读 `GET /repos/<repo>/pulls/<n>` 确认 `merged: true`，再顺手确认数据仓 Pages workflow 因这次 push 触发并最终 success（`GET /repos/<repo>/actions/runs?per_page=3`）。合并失败或 Pages 失败都立即汇报，不重试超过一次。
4. **留痕**：A 档合并后在 PR 下留一条评论：`🤖 已按 SKILL.md「PR 检查与合并」A 档标准自动合并：<逐项列出命中的条件>。` B 档评论同理写清卡在哪一条。

## 汇报格式（每轮有 PR 时）

```
🔍 PR 巡检 {YYYY-MM-DD} {HH:MM} JST
- breaker-delta：{n} 个 open PR
- breaker-delta-data：{n} 个 open PR
（逐条）#<n> 《标题》— A 档已合并 / B 档待 Dai 决定（原因：…）/ 已拦截（原因：…）
```

## 红线

- 绝不合并 B 档与拦截项；拿不准就按 B 档处理并汇报，不猜。
- 绝不 force 合并、绝不跳过失败的 check runs、绝不改分支保护来迁就某个 PR。
- 绝不因为「作者是 Dai 本人」就跳过分档检查；Dai 的 PR 同样先过清单，他点名要直接合的除外（以他的原话为准）。
- 评论只写检查事实，不透露 token、内部路径等无关信息。
