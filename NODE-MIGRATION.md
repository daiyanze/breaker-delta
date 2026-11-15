# Breaker Delta — Node / TypeScript 迁移开工单

日期：2026-11-15 · 起点版本：Python 0.15.1（commit fdc9bdd）
决策：全栈迁 Node + TypeScript，渐进迁移，不大爆炸重写。Python 在对等验证完成前不删、不改行为。

## 为什么迁

1. Chrome 扩展与引擎共用一套领域逻辑，消除双实现漂移（已发生：扩展旧站点地址、topic-<slug>.html 旧链接格式）。
2. Breaker Delta 要做成 Skill，让 agent harness 在本地跑：CLI 打包成单个可执行 JS，harness 只需要 Node。
3. 现有功能没有一项非 Python 不可：HTTP、RSS/XML/JSON 解析、计数/分组、文件状态、静态站点生成，Node 都能做；语义判断本来就归 Agent。

## 目标结构（monorepo，npm workspaces）

```
packages/core/       @breaker-delta/core — 纯领域逻辑，零运行时依赖
packages/fetchers/   @breaker-delta/fetchers — 26 组抓取器（Phase 2）
packages/publisher/  @breaker-delta/publisher — 静态站点生成（Phase 3）
apps/cli/            @breaker-delta/cli — scan/review/record/publish/doctor（Phase 4）
apps/extension/      Chrome 扩展，引用 core（Phase 5；现 extension/ 先不动）
skills/              Skill 定义更新为调 Node CLI（Phase 4）
radar/               Python 原样保留，直到对应 Phase 对等验证通过
```

core 的硬规则：
- 零运行时依赖；TypeScript strict；测试用 node:test，不引测试框架。
- 纯函数不写死路径：数据目录、state 路径、日期都由调用方传入（为 Skill 化做准备）。
- 行为与 Python 逐项对等，包括怪癖，不许顺手"优化"：
  - 有两个不同的 tokens()：scan 版（小写、[a-z0-9.-] 长度≥3、去停用词）和 publish 版（英文词 + CJK 单字），分开命名 scanTokens / publishTokens。
  - 浪高 v2：heat = base(must 60 / watch 30 / seed 10， 未知等级 10) + 20×sources + 8×links + 25×首现，无上限。
  - classify：先扫 title 再扫 body，规则顺序 安全→政策与监管→开源→商业与资本→Agent 与应用→AI 模型，首个命中胜出，无命中→行业动态。
  - slugify：小写，非 [a-z0-9 CJK/假名/韩文] 连续字符→"-"，合并、去首尾、截 48 字再去尾 "-"，空→fallback。
  - resonance 分组：同 token ≥2 源、组内条目 ≤12、去重键为排序后的 name 元组、排序 (-源数, -条目数, token)、截 60 组。
  - alerts：resonance = 最新期首现且 ≥2 源；surge = 已有话题（上一时间点在榜）浪高涨 ≥30，新上榜只报 resonance（0.13.1 口径）。
  - store：first_seen 永不移动、sources 累积去重、每次 upsert 追加 history、review due = first_seen 满 14 天且 result 为空。

## 分期

- **Phase 0 黄金样本**：Python 脚本对固定输入集跑全部待迁纯函数，输出 `packages/core/fixtures/golden.json`。输入集要覆盖：中英日标题、CJK slug、分类边界（title 命中 vs body 命中 vs 无命中）、浪高各等级、resonance 多源/单源/超 12 条、controls 的 mute/boost/alert/max_age、store upsert/review、topics/alerts 全链（用 tests/test_publish.py 的 ED1/ED2 fixture 扩展）。
- **Phase 1 core**：迁移 scan.py 的 tokens/resonance/topic_weights/item_time/apply_controls、store.py 全部、vocab.py 的判定逻辑（存储注入）、publish.py 的 heat_of/classify/slugify/title_keywords/topic_key/build_topics/parse_track_record/topics_data/alerts_data。TS 测试直接读 golden.json 逐项比对。
- **Phase 2 fetchers**：common（parse_feed 等）+ 25 个抓取器分批迁，双跑比对候选文件。✅ 已完成（0.17.0-dev，2026-11-15）：`@breaker-delta/fetchers` 全量落地，golden 36 parse 用例 + config 对 PyYAML 全过（TS 57 测试），实网双跑 24/25 源 status 一致、21 源 URL 100% 重合（差异均为活数据漂移/Reddit 限流，详见 CHANGELOG）；双跑修掉 undici 未读 error body 崩进程一处。
- **Phase 3 publisher**：publish.py 其余部分（HTML/Feed/sitemap），逐页与 Python 构建产物 diff。✅ 已完成（0.18.0-dev，2026-11-15）：`@breaker-delta/publisher` 全量落地，三层对等验证全过——fixture 逐字节 diff 92/92、真实数据逐字节 diff 554/554（首轮 12 处差异全因 bloomberg.com 间歇机器人挑战、非逻辑分歧）、test_publish.py 9 测试 TS 对应版全过（npm 共 175、pytest 52）。
- **Phase 4 CLI + Skill**：scan/review/record/publish/doctor 五命令，机器可读输出（--json）、退出码、原子写入；打包单文件；SKILL.md 改调 Node CLI，数据目录显式传入。
- **Phase 5 扩展**：extension/ 迁 apps/extension，改引 core，删手抄逻辑；数据仓 CI 顺带打包用户自己的扩展。

## 本轮范围（Phase 0 + 1）

做：仓库根 package.json（workspaces）、tsconfig.base.json、packages/core 全部文件与测试、golden 生成脚本 `scripts/make_golden.py` 与 fixture、CHANGELOG 记一笔、README 加一句迁移中说明（可选）。
不做：不动 radar/*.py 行为、不动 extension/、不动数据仓、不推送（本地一次提交，等 Dai 确认再推）。
验收：`npm test`（core）全过且与 golden 一致；Python `pytest` 仍 52 全过；`node --check`/tsc 无错。
