# 浪尖雷达 · 收苗 — Breaker Delta Seed Catcher

浪尖雷达 / Breaker Delta 的浏览器扩展（Chrome 先行，版本 0.3.0）。
对应第一梯队路线图的 A1（一键收苗）+ A2（浪高徽章）+ C1（角标提醒）。

**本目录是扩展源码的正式存放地**（引擎仓 daiyanze/breaker-delta 的
`apps/extension/`，自 0.20.0 起为 monorepo 的 `@breaker-delta/extension`
包）。源码是 TypeScript，领域逻辑不手抄：话题/提醒的数据形状用
`@breaker-delta/core` 的类型（与站点发布器同一套，类型层引入——core
索引含需要 node:fs 的 store/vocab 模块，进不了浏览器打包），话题页
文件名规则与 core 的 `topicFile` 对齐；扩展自身的纯逻辑（页面匹配、
角标计数、话题链接、收苗记录）收在 `src/logic.ts`。
独立目录 `~/workspace/breaker-delta-extension/` 是预先部署好的侧载副本
（构建产物 + 线上数据快照），供直接加载实测，内容由本包构建刷新。

`data/topics.json` 与 `data/alerts.json` 由站点构建生成，属于实例数据，
**不存放在本仓库**：使用前按 `data/README.md` 的说明，从一次构建产物或
已发布站点复制进来（`data/.gitignore` 会防止它们被提交）。扩展改为直接
从已发布站点实时拉取这份 JSON 是后续步骤。

技术形态：Manifest V3 + TypeScript（strict），esbuild 打包（仅
devDependency，运行时零依赖）。`npm run build -w @breaker-delta/extension`
产出 `dist/`——一个可直接「加载已解压的扩展程序」的完整目录。

## 功能一览

| 功能 | 状态 | 说明 |
|---|---|---|
| A1 收苗弹窗 | 可用（本地） | 抓当前页标题/URL/选中文本 + 一句话理由，存本地苗头箱 |
| A1 导出投苗 | 可用 | 一键复制 GitHub Issue 格式文本（标题/链接/理由），或下载 JSON |
| A2 浪高徽章 | 可用（构建生成数据，见 data/README.md） | 在 5 个站点页面命中已收录话题时，右下角显示浪高徽章条 |
| C1 角标提醒 | 可用（构建生成数据，见 data/README.md） | 安装时读取自带 alerts 数据，扩展图标角标显示提醒条数 |
| Safari 版 | 未做 | Chrome 版验证有人用之后，用同一套代码经 Xcode 打包 |

## 在 Chrome 里加载（unpacked 侧载）

先构建：`npm run build -w @breaker-delta/extension`（在仓库根目录执行），
再把两个数据 JSON 复制进 `apps/extension/dist/data/`（见
`data/README.md`）；或直接用已部署好的侧载副本
`~/workspace/breaker-delta-extension/`（产物与数据快照都已就位）。然后：

1. 打开 `chrome://extensions/`
2. 打开右上角「开发者模式」
3. 点「加载已解压的扩展程序」，选择构建产物目录 `apps/extension/dist/`（或侧载副本目录）
4. 扩展栏出现 🌊 图标即加载成功；图标右下角的橙色角标数字是当前数据快照里的提醒条数

使用：

- **收苗**：在任何页面点扩展图标 →（可选）先在页面上选中一段文字 → 填一句理由 → 点「收下这个苗头」。苗头会出现在弹窗下方的本地苗头箱里，可逐条删除。
- **导出投苗**：点「导出投苗」把苗头箱全部内容复制成 Issue 格式文本，去浪尖雷达仓库新建 Issue 粘贴即可；或点「下载 JSON」存档。
- **看徽章**：打开与 `data/topics.json` 真实话题快照匹配的页面（见下方数据格式），页面右下角会出现「🌊 浪尖雷达已收录 · 浪高 N · 首现 日期」徽章条；若该话题同时在 alerts 快照里，还会多一个「⚡正在破圈」标记。徽章可点 × 关闭。徽章里的「查看话题」链接指向已发布站点的话题页（`https://daiyanze.github.io/breaker-delta-data/<slug>.html`，与发布器生成的话题页文件名一致）。

## 权限说明（为什么只要这三个）

`manifest.json` 只申请了最小权限：

- `activeTab`：只在你点击扩展图标时，临时获得当前标签页的访问权，用来读标题/URL 和选中文本。平时扩展碰不到你的页面。
- `scripting`：配合 `activeTab`，在你点击收苗时读取页面选中文本（`window.getSelection()`）。
- `storage`：把苗头箱存在浏览器本地（`chrome.storage.local`）。

内容脚本（徽章）只在以下 5 个站点运行，由 manifest 的 matches 限定，
不在任何其他网站注入：

- `github.com`
- `news.ycombinator.com`
- `reddit.com`（含子域名）
- `x.com`
- `producthunt.com`（含子域名）

没有申请 `tabs`、`history`、`cookies`、`<all_urls>` 或任何后台网络权限，
后台 service worker 不做任何远程请求。

## 隐私声明

- **不收集浏览历史**：扩展不会记录你访问过哪些页面。内容脚本只在上述 5 个站点把「当前页 URL/标题」和扩展自带的话题索引在本地比对，比对结果不离开浏览器。
- **只响应主动操作**：收苗只发生在你点击「收下这个苗头」时；抓取范围只有当前页的标题、URL、你选中的文本和你填的理由。
- **数据只存本地**：苗头箱存在你浏览器本地，不自动上传任何服务器。导出（复制 Issue 文本 / 下载 JSON）完全由你手动触发，内容发到哪里由你决定。
- **无遥测、无第三方脚本**：本扩展不含统计、广告或远程代码。

## 数据格式

### 苗头（seeds，存 chrome.storage.local 的 `seeds` 键）

```json
{
  "id": "seed-<时间戳>-<随机串>",
  "title": "页面标题",
  "url": "页面链接",
  "selectedText": "收苗时页面上选中的文本，可为空",
  "note": "一句话理由，可为空",
  "capturedAt": "2026-11-15T00:00:00.000Z"
}
```

导出的投苗文本与 A4 网页投苗 / GitHub Issue 模板是同一套字段：

```
标题：…
链接：…
理由：…（未填理由时用选中文本摘录代替）
```

### data/topics.json（话题索引，A2 徽章用）

由浪尖雷达站点构建从 editions 自动生成（站点输出的
`site/data/topics.json`），使用前复制进本目录（见 `data/README.md`；
文件不存仓库）。话题数量随每期构建变化，`generated_at` 是最新一期
的发布时间。每条字段：

```json
{
  "generated_at": "…",
  "topics": [
    {
      "slug": "话题页 slug",
      "title": "话题标题",
      "heat": 128,
      "first_seen": "2026-11-13",
      "level": "must",
      "url_patterns": ["github.com/example-org/agent-framework"],
      "title_keywords": ["agent-framework"]
    }
  ]
}
```

`url_patterns` 由该话题各期原文链接的域名+路径派生，`title_keywords`
由标题派生。

匹配规则：当前页 URL 包含任一 `url_patterns` 子串，或页面标题/URL 包含任一
`title_keywords`（不分大小写），即视为命中。

### data/alerts.json（破圈提醒，C1 用）

同样由站点构建生成（复制方式同上），规则：
`resonance` = 最新一期首现且达到 ≥2 源共振；`surge` = 已有话题相对上一
时间点浪高涨幅 ≥30（新上榜话题只报 resonance，不报 surge）。字段含 `topic_slug`、`title`、`reason`、
`heat_before` / `heat_after`、`edition` / `triggered_at`（最新一期时间戳），
以及去重键 `dedupe_key`（`slug:reason:edition`，同一话题同一原因同一期
只推一次）。后台 service worker 目前只在安装/启动时读这份自带文件并
设置角标，**不做远程轮询**。

## 数据怎么来 / 后续

- 现在：`topics.json` / `alerts.json` 由浪尖雷达站点构建（站点 0.13.0 起）
  从 editions 自动生成并随站点发布在 `data/topics.json` /
  `data/alerts.json`；扩展使用前把这两个文件复制进 `data/`（不存仓库，
  打包时由 CI 从实例数据注入）。
- 后续步骤：扩展改为定时从已发布站点**实时拉取**这份静态 JSON 覆盖
  本地缓存，不再靠重新打包快照更新——全程仍然无后端、无账号。
- 徽章里的「查看话题」链接自 0.3.0 起是真实链接：基址为现行站点
  `https://daiyanze.github.io/breaker-delta-data/`，话题页文件名与
  `@breaker-delta/core` 的 `topicFile` 规则一致（`<slug>.html`，即
  发布器实际产物；0.2.x 的旧基址与 `topic-<slug>.html` 占位形式已废弃）。
- 收苗箱后续可直接对接 A4 的 GitHub Issue 收件流程；当前先用复制/下载
  的手动导出，避免在原型阶段引入任何服务器依赖。

## 文件结构

```
apps/extension/               # 位于引擎仓 daiyanze/breaker-delta（@breaker-delta/extension）
├── manifest.json      # MV3 清单（权限与站点匹配都在这里）
├── popup.html         # 收苗弹窗
├── popup.css
├── src/
│   ├── logic.ts       # 纯逻辑：匹配 / 角标 / 话题链接 / 收苗记录（引 @breaker-delta/core）
│   ├── popup.ts       # 收苗 / 苗头箱 / 导出
│   ├── content.ts     # A2 浪高徽章注入
│   └── background.ts  # C1 角标提醒（service worker）
├── scripts/bundle.mjs # esbuild 打包 + 静态文件拷贝 → dist/
├── test/              # logic 的 node:test 测试（合成 fixture）
├── data/
│   ├── README.md      # 数据文件来源说明（JSON 本身不存仓库）
│   ├── .gitignore     # 忽略 topics.json / alerts.json
│   ├── topics.json    # 话题索引（构建生成，使用前复制进来）
│   └── alerts.json    # 破圈提醒（构建生成，使用前复制进来）
├── icons/             # icon16/48/128.png（PIL 生成的海浪占位图）
├── dist/              # 构建产物（不存仓库）：可直接加载的完整扩展目录
└── README.md
```

图标是 Python PIL 画的简单海浪占位图（深蓝底 + 波浪线），正式版再换品牌图标。
