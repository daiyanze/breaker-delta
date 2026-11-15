![浪尖雷达 · Breaker Delta](assets/banner.png)

[English](README.md) | **简体中文**

# 浪尖雷达 · Breaker Delta

*浪起之前，先有回波。* Catch it before it breaks.

全网热点雷达：在热点到达大众搜索之前，从源头层抓到它。扫描频度由使用者自行定义，程序不写死任何节奏。

**在线实例** —— Dai 的实例：[daiyanze.github.io/breaker-delta-data](https://daiyanze.github.io/breaker-delta-data/)（实例数据仓：[daiyanze/breaker-delta-data](https://github.com/daiyanze/breaker-delta-data)）

## 工作原理

热点有固定的传播顺序：实验室或大账号先发（X、Hugging Face），某个 GitHub 仓库爆了，目录站和媒体跟进，最后 Google Trends 的曲线才起来。浪尖雷达读的是前两步，Trends 只用来事后验证。设计参考 [zhuyansen/new-term-radar](https://github.com/zhuyansen/new-term-radar)。

- **三层信息源** —— L1 源头层（官方博客、GitHub、Hacker News、Hugging Face、Product Hunt、arXiv 等）、L2 发酵层（Reddit、科技媒体、目录站、Google News 等）、L3 验证层（Google Trends，只核对不发现）。共 26 个抓取组，除 X 外全部免费免 key，清单见 [SOURCES.zh-CN.md](SOURCES.zh-CN.md)。
- **共振，不是转述** —— 同一话题要有 ≥2 个真正独立的来源才算热点。组合源（官方博客组、科技媒体组、目录站组）内部整组只算一个源：一家公司的通稿被转述十次，仍然只是一个源。单源信号只记为苗头，不混进热点榜。
- **分级** —— agent 按固定量化门槛把候选分为 🔥必看 / 👀关注 / 🌱苗头。
- **浪高** —— 每个话题有一个不设上限的量化分数：等级基分（必看 60 / 关注 30 / 苗头 10）+ 20 × 独立来源数 + 8 × 证据链接数 + 首现 25。站点按浪高排名，并跨期追踪它的涨落。
- **复盘闭环** —— 话题被报出 14 天后回看：它到底涨起来没有？战绩公开登记，落空的也留着。

完整方法论（写给人看的版本）在 [methodology.zh-CN.md](methodology.zh-CN.md)。

## 仓库结构

本仓库按 agent 能直接用的分层组织：

| 层 | 位置 | 作用 |
|---|---|---|
| 指令 | `skills/breaker-delta/SKILL.md` | agent 照着跑的执行步骤、判定规则、报告模板 |
| 配置 | `config.example.yaml` | 信息源清单、量化门槛、关键词、时区——调参只动这里（YAML，JSON 兼容） |
| 引擎 | `packages/` + `apps/` | 确定性工作交给代码（见下） |
| 状态 | *使用者的数据仓* | 期次、话题台账、战绩台账——实例数据不进本仓库 |

引擎包（npm workspaces，TypeScript，零运行时依赖）：

- `packages/core` —— `@breaker-delta/core`：领域逻辑——浪高、共振分组、分类、slug、话题台账、新词词汇表、复盘记账。
- `packages/fetchers` —— `@breaker-delta/fetchers`：26 个抓取组，各自把信息源归一化成候选。
- `packages/publisher` —— `@breaker-delta/publisher`：静态站点生成器——海浪榜、涨潮榜、苗头、分类、数据源页、带海浪图的话题页、往期归档、战绩、RSS/Atom、sitemap。
- `apps/cli` —— `@breaker-delta/cli`：统一 CLI（`scan` / `review` / `record` / `publish` / `doctor` / `mcp`），打包成单个自包含的 `breaker-delta.mjs`。
- `apps/extension` —— Chrome 收苗扩展：一键收苗、命中话题页显示浪高徽章——见 [apps/extension/README.zh-CN.md](apps/extension/README.zh-CN.md)。

## 引擎 / 数据分仓

本仓库**只有代码**。实例的数据——`editions/`、`state/`（话题台账、词汇与 sitemap 基线）、`track-record.md`、自己的 `config.yaml`——放在使用者自己的**数据仓**里。数据仓的 CI 拉取引擎仓、用 Node bundle 构建站点、部署到数据仓自己的 GitHub Pages。[daiyanze/breaker-delta-data](https://github.com/daiyanze/breaker-delta-data) 是一个现成样例：照它的形状建仓、换上你自己的数据，雷达就是你的。

## 快速开始

需要 Node ≥ 20，无运行时依赖。

```bash
git clone https://github.com/daiyanze/breaker-delta.git
cd breaker-delta
npm ci
npm run bundle        # 构建 apps/cli/dist/breaker-delta.mjs —— 单个文件

BD="node apps/cli/dist/breaker-delta.mjs"
$BD --data-dir /path/to/your-data doctor                    # 离线自检
$BD --data-dir /path/to/your-data scan --edition morning    # 抓取一期的候选
$BD --data-dir /path/to/your-data review                    # 列出到期该复盘的话题
$BD --data-dir /path/to/your-data publish --out site        # 构建静态站点
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
node apps/cli/dist/breaker-delta.mjs --data-dir /path/to/your-data mcp
```

## 作为 Skill 使用

把 `skills/breaker-delta/` 装进你的 agent harness（Claude Code、Codex 等），或直接让 agent 读 `SKILL.md` 按步骤执行：skill 用 CLI 跑抓取层、按方法论分级、用 `record` 写回期次与台账、按固定格式出报告。定时完全由你决定——agent 自己的 cron、GitHub Actions 或手动跑都可以；雷达本身不规定频度。

## 配置

在数据目录里放一份 `config.yaml`（以 `config.example.yaml` 为模板；YAML 带内置子集解析器，无需任何依赖，JSON 照常兼容）。用户实际会调的旋钮：

| 选项 | 作用 |
|---|---|
| `keywords.mute` 屏蔽词 | 命中的候选（标题+摘要，子串、不分大小写）直接丢弃 |
| `keywords.boost` 关注词 | 命中打标，单源苗头可升为关注 |
| `keywords.alert` 必看词 | 命中打标并汇入候选文件的 `keyword_alerts`；再有第二源共振即列必看候选 |
| `topics` 主题权重 | 相关性权重（1–5），换行业主要改这一节 |
| `sources.<源>.enabled / max_items` | 关掉某个源（报告里记「已停用」，不算缺失）或统一截断条数 |
| `filters.max_age_hours` 新鲜度窗口 | 只对带时间戳的候选生效，太旧的丢弃 |
| `vocab.window_days` 新词词汇表 | 实体名字在窗口内没出现过 → 打 `novel` 标，是优先级最高的苗头信号；第一次运行只建基线 |

## Chrome 扩展

`apps/extension` 是 Manifest V3 扩展，与引擎共用 `@breaker-delta/core`：在任何页面一键收苗，打开已收录话题的页面时显示浪高徽章，图标角标显示提醒条数。加载与使用见 [apps/extension/README.zh-CN.md](apps/extension/README.zh-CN.md)。

## 文档索引

- [方法论](methodology.zh-CN.md) —— 分层、门槛、分级、复盘（[English](methodology.md)）
- [自带信息源一览](SOURCES.zh-CN.md) —— 全部 26 个抓取组与各自口径（[English](SOURCES.md)）
- [Roadmap](ROADMAP.zh-CN.md) —— 从内部工具到公开站点的路线与已上线项（[English](ROADMAP.md)）
- [Privacy](PRIVACY.md) —— 只读、不登录、不发帖
- [Changelog](CHANGELOG.md)

## 边界

只读公开信息，不发帖、不互动；密钥只走环境变量，不进仓库。见 [PRIVACY.md](PRIVACY.md)。

---

*历史：浪尖雷达最初是 Python 实现，0.16.0–0.20.0 全面迁到 Node/TypeScript 并完成生产切换，Python 实现已于 0.21.0 退役，存档于 git 标签 `v0.15.1-python-final`。*
