![浪尖雷达 · Breaker Delta](assets/banner.png)

[English](README.md) | **简体中文**

# 浪尖雷达

*浪起之前，先有回波。*

**30 秒版** —— 浪尖雷达是一个开源的热点雷达，专抓「还没成热点」的话题：扫描 40+ 信源，只有 ≥2 个独立来源共振才算热点，用不设上限的**浪高**打分，每次判断公开分级、14 天后逐条复盘（落空的也留着）。同一个引擎换一个 **preset** 就能跑你自己的行业：你的信源、你的分类、你的数据仓。扫描频度由使用者自行定义，程序不写死任何节奏。

**在线实例** —— 作者的实例（AI/科技 preset）：[breakerdelta.com](https://breakerdelta.com) · [产品介绍](https://breakerdelta.com/landing.html) · 实例数据仓：[daiyanze/breaker-delta-data](https://github.com/daiyanze/breaker-delta-data)

## 工作原理

热点有固定的传播顺序：实验室或大账号先发（X、Hugging Face），某个 GitHub 仓库爆了，目录站和媒体跟进，最后 Google Trends 的曲线才起来。浪尖雷达读的是前两步，Trends 只用来事后验证。设计参考 [zhuyansen/new-term-radar](https://github.com/zhuyansen/new-term-radar)。

- **三层信息源** —— L1 源头层（官方博客、GitHub、Hacker News、Hugging Face、Product Hunt、arXiv 等）、L2 发酵层（Reddit、科技媒体、目录站、Google News 等）、L3 验证层（Google Trends，只核对不发现）。共 26 个抓取组，除 X 外全部免费免 key，清单见 [SOURCES.zh-CN.md](SOURCES.zh-CN.md)。
- **共振，不是转述** —— 同一话题要有 ≥2 个真正独立的来源才算热点。组合源（官方博客组、科技媒体组、目录站组）内部整组只算一个源：一家公司的通稿被转述十次，仍然只是一个源。单源信号只记为回波，不混进热点榜。
- **分级** —— agent 按固定量化门槛把候选分为 🔥必看 / 👀关注 / 🌀回波。
- **浪高** —— 每个话题有一个不设上限的量化分数：等级基分（必看 60 / 关注 30 / 回波 10）+ 20 × 独立来源数 + 8 × 证据链接数 + 首现 25。站点按浪高排名，并跨期追踪它的涨落。
- **复盘闭环** —— 话题被报出 14 天后回看：它到底涨起来没有？战绩公开登记，落空的也留着。

## Preset（行业包）

**preset** 是把同一个引擎对准不同行业的可替换包：信源清单、主题权重、关键词默认值、**分类规则**，外加给扫描 agent 的行业简报。共振、浪高、分级、复盘这些机制留在引擎里。

- `presets/ai-tech/` 是内置例子（在线实例跑的就是它）。
- `breaker-delta preset list` 列出内置 preset；`preset init <名>` 把一份拷进你的数据目录改成你自己的。
- 不用手写：**breaker-delta-setup** 向导 Skill 会采访你（行业、分类、信源——每个候选源先实测能抓到才收）并写好配置。
- 配置分层（低到高）：preset 默认 ← 你的 `config.yaml` ← 环境变量。

## 仓库结构

本仓库按 agent 能直接用的分层组织：

| 层 | 位置 | 作用 |
|---|---|---|
| 指令 | `skills/breaker-delta/` + `skills/breaker-delta-setup/` | 运行 Skill（扫描→分级→发布→报告）与配置向导 Skill |
| 配置 | `config.example.yaml` | 信息源清单、量化门槛、关键词、时区——调参只动这里（YAML，JSON 兼容） |
| 行业包 | `presets/` | 可替换的 preset（信源 / 分类 / 关键词 / 简报） |
| 引擎 | `packages/` + `apps/` | 确定性工作交给代码（见下） |
| 模板 | `templates/` | 部署起步模板（Cloudflare Pages，Beta） |
| 状态 | *使用者的数据仓* | 期次、话题台账、战绩台账——实例数据不进本仓库 |

引擎包（Bun workspaces，TypeScript，零运行时依赖）：

- `packages/core` —— `@breaker-delta/core`：领域逻辑——浪高、共振分组、分类、slug、话题台账、新词词汇表、复盘记账。
- `packages/fetchers` —— `@breaker-delta/fetchers`：26 个抓取组，各自把信息源归一化成候选。
- `packages/publisher` —— `@breaker-delta/publisher`：静态站点生成器——海浪榜、涨潮榜、回波、分类、数据源页、带海浪图的话题页、往期归档、战绩、产品介绍页、RSS/Atom、sitemap；也能渲染进内存供动态服务使用。
- `apps/cli` —— `@breaker-delta/cli`：统一 CLI（`scan` / `review` / `record` / `publish` / `serve` / `preset` / `doctor` / `docs` / `mcp`），打包成单个自包含的 `breaker-delta.mjs`。
- `apps/extension` —— Chrome 收波扩展：一键收波、命中话题页显示浪高徽章——见 [apps/extension/README.zh-CN.md](apps/extension/README.zh-CN.md)。

## 引擎 / 数据分仓

本仓库**只有代码**。实例的数据——`editions/`、`state/`（话题台账、词汇与 sitemap 基线）、`track-record.md`、自己的 `config.yaml`——放在使用者自己的**数据仓**里。数据仓的 CI 拉取引擎仓、用引擎 bundle 构建站点、部署到数据仓自己的 GitHub Pages。[daiyanze/breaker-delta-data](https://github.com/daiyanze/breaker-delta-data) 是一个现成样例：照它的形状建仓、换上你自己的数据，雷达就是你的。

## 快速开始

### Docker（推荐）

从零到第一张榜单，全程不改代码。分级由你自己的 AI agent 按 Skill 完成并推送进来，容器负责抓取、渲染与托管。

```bash
git clone https://github.com/daiyanze/breaker-delta.git
cd breaker-delta
# 把数据目录放进 ./data —— breaker-delta-setup 向导 Skill 能对话生成，
# 或先照参考数据仓的形状拷一份
cp .env.example .env   # 把 BD_PUSH_TOKEN 设成一串长随机字符串
docker compose up -d   # 榜单在 http://localhost:8080
```

完整走法：[快速开始](https://docs.breakerdelta.com/docs-getting-started.html) · [自建与部署](https://docs.breakerdelta.com/docs-deploy.html)。

### 本地（Bun）

需要 Bun ≥ 1.2，无运行时依赖、无需数据库。

```bash
git clone https://github.com/daiyanze/breaker-delta.git
cd breaker-delta
bun install
bun run bundle        # 构建 apps/cli/dist/breaker-delta.mjs —— 单个文件

BD="bun apps/cli/dist/breaker-delta.mjs"
$BD --data-dir /path/to/your-data doctor                    # 离线自检
$BD --data-dir /path/to/your-data scan --edition morning    # 抓取一期的候选
$BD --data-dir /path/to/your-data publish --out site        # 构建静态站点
$BD --data-dir /path/to/your-data serve                     # 或动态托管（带推送 API）
```

分级结果写回台账是一等命令（台账写入是原子操作）：

```bash
echo '[{"name":"Some New Model","sources":["Hacker News","Reddit"],"grade":"must"}]' > picks.json
$BD --data-dir /path/to/your-data record picks.json
$BD --data-dir /path/to/your-data record review --name "Some New Model" --result hit
```

所有命令都显式带 `--data-dir`（或用环境变量 `BD_DATA_DIR`），并支持 `--json` 输出机器可读结果。

**MCP**：同一个 bundle 也是一个 stdio MCP 服务（工具 `radar_scan`、`radar_review`），在 agent harness 里这样注册：

```bash
bun apps/cli/dist/breaker-delta.mjs --data-dir /path/to/your-data mcp
```

## 作为 Skill 使用

把 `skills/breaker-delta/` 装进你的 agent harness（Claude Code、Codex 等），或直接让 agent 读 `SKILL.md` 按步骤执行：skill 用 CLI 跑抓取层、按方法论分级、用 `record` 写回期次与台账、按固定格式出报告。新实例先走 `skills/breaker-delta-setup/` 向导：采访完把配置和行业简报写好。定时完全由你决定——agent 自己的 cron、GitHub Actions 或手动跑都可以；雷达本身不规定频度。

## 配置

在数据目录里放一份 `config.yaml`（以 `config.example.yaml` 为模板；YAML 带内置子集解析器，无需任何依赖，JSON 照常兼容），或从 preset 起步、只覆盖要改的段。用户实际会调的旋钮：

| 选项 | 作用 |
|---|---|
| `keywords.mute` 屏蔽词 | 命中的候选（标题+摘要，子串、不分大小写）直接丢弃 |
| `keywords.boost` 关注词 | 命中打标，单源回波可升为关注 |
| `keywords.alert` 必看词 | 命中打标并汇入候选文件的 `keyword_alerts`；再有第二源共振即列必看候选 |
| `topics` 主题权重 | 相关性权重（1–5），换行业主要改这一节 |
| `categories` 分类规则 | 你这个行业的分类（标题优先匹配、兜底类、各语言名） |
| `sources.<源>.enabled / max_items` | 关掉某个源（报告里记「已停用」，不算缺失）或统一截断条数 |
| `filters.max_age_hours` 新鲜度窗口 | 只对带时间戳的候选生效，太旧的丢弃 |
| `vocab.window_days` 新词词汇表 | 实体名字在窗口内没出现过 → 打 `novel` 标，是优先级最高的回波信号；第一次运行只建基线 |

## Chrome 扩展

`apps/extension` 是 Manifest V3 扩展，与引擎共用 `@breaker-delta/core`：在任何页面一键收波，打开已收录话题的页面时显示浪高徽章，图标角标显示提醒条数。加载与使用见 [apps/extension/README.zh-CN.md](apps/extension/README.zh-CN.md)。

## 文档索引

- **独立文档站（中英双语）** —— docs.breakerdelta.com 上的用法说明，不占实例站点：[文档总览](https://docs.breakerdelta.com/docs.html) · [English Docs](https://docs.breakerdelta.com/en/docs.html) —— 快速开始、看懂站点、CLI 参考、配置、Skill 与 MCP、Chrome 扩展、自建与部署。源文件在 `packages/publisher/src/docs.ts`；日文站暂时显示英文版。
- [自带信息源一览](SOURCES.zh-CN.md) —— 全部 26 个抓取组与各自口径（[English](SOURCES.md)）
- [Privacy](PRIVACY.md) —— 只读、不登录、不发帖
- [Changelog](CHANGELOG.md)

## 边界

只读公开信息，不发帖、不互动；密钥只走环境变量，不进仓库。见 [PRIVACY.md](PRIVACY.md)。

## 许可证

[Apache License 2.0](LICENSE)。代码任何人可用，包括商用；Breaker Delta 的名称与品牌不在许可授予范围内。

---

*历史：浪尖雷达最初是 Python 实现，0.16.0–0.20.0 全面迁到 Node/TypeScript 并完成生产切换，Python 实现已于 0.21.0 退役，存档于 git 标签 `v0.15.1-python-final`。*
