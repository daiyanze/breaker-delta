---
name: breaker-delta
description: Run one edition (morning/evening) of the twice-daily web hot-topic radar — scan layered sources with the Breaker Delta CLI, judge signals against fixed thresholds, dedupe against the topic store, and emit the report in the fixed format.
---

# Breaker Delta（浪尖雷达）— 执行指令

完整方法论在仓库根目录 `methodology.md`。本文件是可执行版：照步骤跑，不要自由发挥结构。

## 输入

- **命令行**：单文件版 Breaker Delta CLI（仓库 `apps/cli/dist/breaker-delta.mjs`，只需 Bun ≥ 1.2），下文记作 `$BD_CLI`，即 `bun /path/to/breaker-delta.mjs`（把路径换成本机实际路径）。所有命令都显式带 `--data-dir <数据目录>`（或设环境变量 `BD_DATA_DIR`）；数据目录里放该实例的 `editions/`、`state/`、`track-record.md` 与配置。
- `config.yaml`（兼容 `config.json`，在数据目录里；都没有就用引擎侧的 `config.example.yaml`）：信息源、门槛、关键词、期次、时区都在里面，**不要把门槛硬编码在脑子里**。
- `<数据目录>/state/seen-topics.json`：话题台账。先读，再扫。
- 期次：morning（06:00 JST，分工见 config）或 evening（18:00 JST）。

常用命令（细节看 `$BD_CLI --help`）：

- 抓取：`$BD_CLI --data-dir <数据目录> scan --edition <morning|evening>`（省略 `--edition` 时按本地小时自动选期次）
- 写回台账：`$BD_CLI --data-dir <数据目录> record <entries.json>`（输入格式见步骤 5）
- 到期复核清单：`$BD_CLI --data-dir <数据目录> review`；回填复核结果：`$BD_CLI --data-dir <数据目录> record review --name <话题> --result hit|miss`
- 构建站点：`$BD_CLI --data-dir <数据目录> publish`
- 环境自检：`$BD_CLI --data-dir <数据目录> doctor`

## 步骤

0. **先跑抓取层**：`$BD_CLI --data-dir <数据目录> scan --edition <morning|evening>`（或省略 `--edition` 自动选期次），读它写出的 `<数据目录>/state/candidates-<日期>-<期次>.json` 作为候选底稿；状态为 missing 的源（通常只有 X，以及当期失败的源）再用网页扫补齐，并在报告里如实标注哪些源是代码抓的、哪些是网页扫的。状态为 disabled 的源是用户在 config 里关掉的，**不算缺失、不要补扫**，报告也不必提。
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
