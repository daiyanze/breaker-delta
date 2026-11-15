# extension/data — 构建时注入，不存仓库

扩展运行时需要两个数据文件，但它们**不存放在本仓库**（数据归实例数据仓，不归引擎仓）：

- `topics.json` — 话题索引（slug / 标题 / 浪高 / 首现 / 链接模式 / 关键词）
- `alerts.json` — 破圈提醒（resonance / surge）

## 怎么得到这两个文件

任意一次站点构建都会在站点根目录生成 `data/topics.json` 和 `data/alerts.json`：

1. 用引擎构建站点：`python -m radar.publish`（产物在 `site/data/`），把两个文件复制到本目录；或
2. 直接从已发布的实例站点下载：`<站点地址>data/topics.json`、`<站点地址>data/alerts.json`（如 Dai 的实例 https://daiyanze.github.io/breaker-delta-data/data/）。

复制进来后即可在 Chrome 里以「加载已解压的扩展程序」使用本目录的完整扩展。本目录的 `.gitignore` 已忽略这两个 JSON，复制进来也不会被提交。
