---
name: breaker-delta-setup
description: Set up a new Breaker Delta radar instance conversationally, or change an existing one's configuration — industry interview, category taxonomy co-creation, keyword/topic weights, subscription sources that are live-validated before they are kept (dead sources are reported and dropped), config.yaml + brief.md written into the data dir, a pilot edition with a calibration round, then the run-mode fork (agent-hosted scheduling vs guided Docker/Cloudflare deployment). Use when an instance has no config yet, or when the user asks to configure a new radar, switch industry, add a source, or change categories. Day-to-day scanning lives in the breaker-delta skill; this skill only configures.
---

# Breaker Delta 配置向导（Setup）— 执行指令

本 Skill 只管**配置**：把一个新实例从零配好，或改一个已有实例的配置。日常扫描运行是 `breaker-delta` 运行 Skill 的事，本 Skill 不复制它的流程，只在试跑（W5）时调用它。

## 输入

- **命令行**：与运行 Skill 同一个 Breaker Delta CLI（仓库 `apps/cli/dist/breaker-delta.mjs`，只需 Bun ≥ 1.2），下文记作 `$BD_CLI`。所有命令都显式带 `--data-dir <数据目录>`；本 Skill 的产物（`config.yaml`、`brief.md`）就写在这个数据目录里。
- **格式参照**：`config.example.yaml`（config 全结构）、`presets/ai-tech/config.yaml`（一个完整 preset 的样子，末尾是 `categories` 段的标准写法）、`presets/ai-tech/brief.md`（行业简报的样子）。

## 什么时候进向导

- 跑 `$BD_CLI --data-dir <数据目录> doctor`，config 检查为 fail（数据目录和引擎侧都找不到 config），或数据目录里还没有 `editions/` 与 `state/` —— 首次运行，进向导。**向导没走完，不要跑运行 Skill 的扫描步骤。**
- 用户明说「配置一个新雷达 / 换个行业 / 加订阅源 / 改分类」—— 进向导；已有配置的走 W7 增量模式，不从头再来。

## 通用规矩

- **一次问一组、先给草案**：每一步先拿出你的草案（分类表、源清单、关键词），用户不反对就按草案定。不要逐个字段盘问，也不要把 YAML 甩给用户让他自己填。
- **产物只写数据目录**：`config.yaml` 与 `brief.md` 都落数据目录。有引擎仓写权限且用户同意时，可另存一份到 `presets/<行业slug>/` 作为他的 preset；没有就跳过，不强求。
- **不编造订阅地址**：每个源必须按 W4 实测，测不过的当场说明原因，不静默收录、不拿别的源的内容冒充。
- **频次永远问用户**：一期还是两期、几点跑，都是用户定；官方实例的早晚两期只是例子。
- 向导是唯一允许**写** config 的场景（日常运行仍守运行 Skill「不改门槛凑结果」的红线）；写的是新配置，不是为某一期凑结果。

## W1 行业访谈（一轮问完）

问清五件事，用户没答的给默认并注明：① 盯哪个行业、哪个细分；② 读者是谁（自己看 / 给粉丝 / 团队内部）；③ 主语言，要不要同时出 en/ja；④ 时区；⑤ 希望多久一期、大概什么时间（可以到 W6 再定）。
从回答里提炼三样东西，后面几步都用：**行业名与 slug**、**3–5 个子领域词**（W3 权重与 W2 分类的种子）、**「什么算这个行业的大事」的一句话直觉**（写进 brief.md）。

## W2 分类共创

- 按行业常识 + 子领域词，拟 **5–8 个分类 + 1 个兜底类**：每个分类给 5–10 个关键词（这个行业标题里最常出现的词，记住分类是子串匹配、标题优先），以及 en/ja 显示名。
- 用表格呈现：`分类 | 关键词 | 一句说明`。用户增删改，**最多来回两轮就定稿**——分类准不准靠 W5 试跑校准，不要在这一桌上耗完。
- 定稿的分类就是 config 的 `categories` 段（`fallback` + `rules`，格式照 `presets/ai-tech/config.yaml` 末尾那段）。

## W3 关键词与主题权重

- `topics`：子领域词逐个给权重 2–5，用户最在意的方向给 5。
- `mute`：问「什么内容你永远不想再看到」，并给一份这个行业的常见垃圾词草案（招商、加盟、纯营销稿之类）供他勾选补充。
- `alert` / `boost`：问「哪类信号一出现必须第一时间知道」→ alert；其余关注词 → boost。
- 用户没有明确答案的就留空数组，不硬塞——这三件套后面随时能改。

## W4 订阅源发现与实测（最重要的一步，禁止跳过实测）

1. **按层列候选**：L1 源头层（行业的一手发布渠道：厂商/机构官方博客与公告、协会、监管原文、预印本与代码托管的行业区）、L2 发酵层（行业媒体、社区论坛、Newsletter、榜单与目录站）、L3 只核对（趋势类工具，只核对曲线、永不作为发现来源）。
2. **用户给的链接逐个处理**：先找 feed —— 页面 `<link rel="alternate">`、常见路径（`/feed`、`/rss`、`/atom.xml`、`/feed.xml`、`/sitemap.xml`）；再确认它落在引擎已支持的源类型里（照 `config.example.yaml` 的 `sources` 结构：RSS/Atom 组、sitemap 组与各专用源）。不在支持范围的站点，如实告诉用户「这个站暂时订阅不了」，写进 brief.md 的「待补订阅」清单，**不假装已订阅**。
3. **实测规程**：候选源先写入草稿 config，跑一次 `$BD_CLI --data-dir <数据目录> scan`，打开它写出的候选文件逐源核对：状态正常且有**近 7 天内**的条目 = 通过；报错、无条目、或只有过期条目 = 不通过，当场把原因告诉用户（无 feed / 已停更 / 抓不到），问要不要换替代源。**不通过的源从 config 里删掉再定稿，config 里不留死源。**
4. **数量参考**：L1 5–15 个、L2 5–10 个足够开局，宁缺毋滥；以后随时走 W7 加。

## W4b 插件选择（你打算拿话题干什么？）

订阅源定了「看什么」，这一步定「拿话题做什么」——话题页要挂哪些用途面板：

- **给候选，不空问**：写作/做内容 → `creator` 创作参考（默认开，建议保留）；盯股票/投资 → `investor` 投资研判；追番/动漫 → `watchlist` 追番建议。按 W1 的行业与读者把最贴的一个放第一个推荐，其余列出供勾选；用户也可以全关。
- **都不合意 → 当场生成新插件草案**：按声明式格式（`plugin.yaml` + `prompt.md` + `schema.yaml` + `panel.yaml`，参照引擎侧 `plugins/investor/` 的样子）在**数据目录** `plugins/<id>/` 里拟一份：先给字段草案（面板上想看哪几项、每项什么口径），用户改，**最多来回两轮定稿**——与 W2 分类共创同一节奏。生成完跑 `doctor`，它的插件检查会验 schema 合法性。
- **落盘方式**：选定的插件写进 config 的 `plugins:` 段（每个插件明确写 `enabled: true/false`，不要靠默认猜测）；新生成的插件包留在数据目录 `plugins/`，是用户自己的数据，不进引擎仓。
- 数据插件的研判质量在 W5 试跑时连同分类一起验，这一步只定「要哪些、字段长什么样」。

## W5 落盘 + 试跑一期

1. **落盘**：把 W2–W4b 的结果补全进数据目录的 `config.yaml`（W4 实测用的草稿在此补齐；结构照 `config.example.yaml`：`language` / `timezone` / `editions` / `sources` / `keywords` / `topics` / `categories` / `plugins`）；`editions` 按 W1 问到的时间写（name/label/time/focus），用户没定就先写一期占位并说明随时可改。行业简报写数据目录 `brief.md`：读者是谁、什么算大事、分层直觉、分类口径、待补订阅清单（样子照 `presets/ai-tech/brief.md`）。跑 `doctor` 确认 config 检查 ok 再继续。
2. **试跑**：完整走一遍 breaker-delta 运行 Skill 的主流程（它的步骤 0–6，含 5c 插件分级注入）出一期试点，照常 `record` 入台账，再 `publish` 构建站点，把成品给用户看。
3. **摊开校准（至少留一轮）**：把本期每条的 `话题 → 分类 → 等级 → 来源数` 列给用户。用户指出分错类的，**改 `categories` 的关键词规则，不改单条结果**，重新 `publish`（不用重扫）再给他看；源太吵或太静的在这一轮一并调（关源、加 mute 词）。**启用了数据插件的，把话题页的插件面板一并摊开验**：研判口径不对、字段多余或缺失的，改插件的 `prompt.md` / `schema.yaml`（数据目录里的包直接改；引擎内置包先拷一份到数据目录再改，同 id 覆盖），重新跑一期试点再看——面板定稿与分类定稿同等重要。用户确认可以了，才进 W6。

## W6 运行模式（二选一，最后问一次）

- **A · 就在 agent 里跑（免部署）**：用当前 agent 环境的定时能力，按用户定的时间注册每期任务，任务内容就是 breaker-delta 运行 Skill 的主流程、数据目录指向本实例；每期跑完在对话里按它的报告模板交报告。把注册好的时间表复述给用户确认，并提醒一句：agent 环境关机或休眠时不会跑，数据只存在本机数据目录。
- **B · 部署**：问 Docker 还是 Cloudflare（二选一，暂时只提供这两种），然后按部署文档分步引导（文档在文档站的部署页）；每步做完先验证（容器起来能打开榜单 / Worker 部署成功且第一期可见）再走下一步，需要用户出账号、密钥或去后台点的，当场说清要他做什么。部署细节以部署文档为准，不在本 Skill 展开。
- 之后想换模式随时回来重走 W6，配置不用重做。

## W7 增量重入（日常改配置的唯一通道）

- **加源**：新链接走 W4 的找 feed + 实测规程，通过才进 config；改完告诉用户结果（收了 / 没收及原因）。
- **改分类**（拆类、并类、改名、调关键词）：改 `categories` 规则后重新 `publish`，历史话题会按新规则重新归类；给用户看变化：原来各多少条、现在各多少条、哪几条换了类。
- **改插件**（启停、加新插件、改字段/口径）：走 W4b 同一流程——启停只改 config 的 `plugins:` 段；改内置插件的口径先把包拷到数据目录 `plugins/<id>/` 再改（同 id 覆盖）；改完跑 `doctor` 验 schema，再 `publish` 看效果。注意：数据插件只对**新期次**产出研判，历史话题不会自动补（要补只能重跑那几期的分级，默认不做）。
- **换行业**：重走 W1–W5 且用**新数据目录**——老台账和期次是旧行业的，不要在老目录上改。
- 任何增量改动之前，先把现有 config 复制一份 `config.bak-<日期>.yaml`，改坏了能回滚。

## 完成标准（结束向导前逐项自检）

- [ ] `doctor` 的 config 检查为 ok
- [ ] `config.yaml` 含非空 `categories`，且每个源都过了 W4 实测（用户明确接受的例外除外，并已告知）
- [ ] `plugins:` 段已按 W4b 结果明确写入（含全关的情况）；启用了数据插件的，试点期次的话题页已验过面板与研判口径
- [ ] `brief.md` 已写入数据目录
- [ ] 试点一期已产出、给用户看过分类/等级清单，且留过至少一轮调整机会
- [ ] 运行模式已选：A 已注册定时并复述时间表 / B 已进入部署引导的第一步
