# Changelog

## Unreleased

（1.0.0 收编预备：本节为 0.22.0 之后全部变更，发布时整体改题 1.0.0。）

- **P2c（切换）官方实例切换到动态版（2026-11-16 晚，Dai 批准直切）**：breakerdelta.com 已由静态构建切换为 `apps/web` 的动态版（Cloudflare Worker `breaker-delta-web`）。数据走新增的**远端后端**（`lib/store-remote.ts`，`BD_DATA_BASE`）：Worker 运行时从公开数据仓的 raw 内容读期次/台账/config/战绩（数据仓根新增 `editions.json` 清单，因为 raw 托管不能列目录），组装缓存带 120 秒 TTL——扫描推送新期次后两分钟内自动上站，不再需要重构建；数据仓仍是唯一真相源，git 流程不变。无文件系统环境下插件面板走构建时打包的内置定义（`lib/bundled-plugins.ts` 直接 import 仓库 plugins/ 的 YAML，非副本）。官方实例不设推送口令且远端后端本就只读（POST 返回 501），写入仍走 git。部署路径的三个实测结论：① Pages 高级模式（_worker.js）不可行——Pages 会重打包 _worker.js，vinext 产物里 chunk 回引入口的循环模块图在重打包后初始化顺序错乱（workerd 启动即 TypeError），且产物默认导出其实是应用对象、真入口是构建时虚拟模块 `vinext/server/app-router-entry`；② 只有把 `cloudflare.config.ts` 放到应用根目录（构建时临时从 deploy/ 拷入）插件才生成完整部署包（`.cloudflare/output/v0/workers/default/bundle/`）；③ 现有 API token 没有 Workers 静态资源上传权限（401），客户端 chunk 改走**资源桥**：chunk 提交进数据仓 `web-assets/`，应用根 `middleware.ts` 在设了 `BD_ASSETS_UPSTREAM` 时把 `/_next/static/*` 请求转发到数据仓 raw 地址并加一年 immutable 缓存（自托管不设此变量、完全无感）。Worker 本体经连接器的 multipart 部署脚本（`cf_worker_deploy.py`，与 cf_api.py 同一凭据通道）以多模块形式直传 API——模块部件必须标 `application/javascript+module`。`@cloudflare/vite-plugin` 与 `cf` 已按官方脚手架钉死版本（2.0.0-beta.v.17 / 1.0.0-beta.32；此前 lock 解析到的 rc.0 未采用）。切换前置修复：今晚的晚报期次此前只写了本地未推远端（线上实际停在 7 期/43 话题），切换时一并补推（远端现 8 期/50 话题），且早晚报两个扫描 cron 已补上「生成 editions.json + 一次性推送数据仓」的收尾步，杜绝只写本地。回滚路径保留：静态版 Pages 项目 `breaker-delta` 原样保留（域名已解绑，pages.dev 子域仍可达），域名改绑回该项目 + 恢复 CNAME 即可回到静态版。D1 后端（store-d1）仍在代码里待 token 补 D1 权限后可选启用，官方实例当前不需要它。
- **P2c（下）推送 API 写库 + Docker 换新服务（2026-11-16）**：`apps/web` 补上与 CLI `serve` 同契约的推送面：`POST /api/editions`（一期成品期次落库）、`POST /api/record`（分级结果写回台账）、`GET /api/health`；鉴权口径一致（未设 `BD_PUSH_TOKEN` 时 403、错口令 401、重复期次 409、`?replace=1` 可覆盖），校验与报错文案逐字对齐 CLI。两种后端都可写：文件后端与 CLI 行为一致（期次写成 JSON 文件、台账写 `state/seen-topics.json`，两服务可共用同一数据目录）；SQLite 后端把期次/台账变更应用到库内载荷、派生话题行在一个事务里重算重写（store 的写入逻辑抽成 `writeAllToDb` 与导入器共用）。写入后站点缓存失效，下一请求即见新数据。实测：两后端各跑通推送→看板出现新话题→record 回写→409 拦截全流程，401/403 各验。修一个真坑：推送来的期次是裸对象、没有加载步附的 `_heat/_rank`，而 core 的 buildTopics 恰恰要求期次自带这两个字段——SQLite 路径入库前按加载器同口径补附（文件路径写裸对象、读时由加载器补，与 CLI 一致）。Docker 换装：根 `Dockerfile` 改为构建 `apps/web` 并以 Node 22 运行 `vinext start`（应用服务端是 Node 程序、SQLite 用 node:sqlite，运行时不再需要 Bun；Bun 只做构建），旧 P1 的 CLI serve 镜像保留为 `Dockerfile.cli-serve` 兜底；镜像布局在本机按 Dockerfile 的 COPY 结构 1:1 组装实测（health / 看板 / record 推送全通），镜像本身的构建待 Dai 的 Mac 复测（同 P1 口径）。官方实例切换与 D1 绑定接线留作 P2c 最后一步，翻生产前单独确认。
- **P2c（上）全量路由 + 页面家具（2026-11-16）**：`apps/web` 补齐静态站的全部页面——涨潮榜（涨幅口径与静态一致：新上榜话题按全额浪高计涨幅）、回波（近 3 期 echo 出现 + 期次戳）、分类索引 + 分类页 + 等级页（must/watch/echo）、数据源列表 + 单源详情（统计口径、config 原文块、贡献话题，复用 publisher 导出的 yamlSourceBlocks/sourceBlock）、往期归档、期次快照页、关于、落地页、战绩（core 的 parseTrackRecord 同款渲染）、投波（Issue 预填链接 + 书签小工具 + 预填框）；数据出口 `/data/topics.json`、`/data/alerts.json` 与 core 的 topicsData/alertsData 逐字段一致，feed.xml/atom.xml（根 + 每语言）、sitemap.xml、robots.txt、llms.txt 均有动态版。页面家具补齐：页脚、主题切换（localStorage `ts-theme`，与静态同键同行为）、海浪榜时间滑杆（改为服务端渲染状态 + `?e=` 导航，无 JS 时时间轴链接照常）、榜单行补齐排名增量/上期排名/时间戳/来源头像/sparkline（trendPoints 同口径）、话题页加海浪图。实测对齐：三语海浪榜、涨潮榜、回波、期次页与静态逐行一致，data JSON 解析后全等，feed 条目标题全等。顺带修一个数据层真相：官方期次 JSON 不带 slot 字段，槽位只在文件名里——web 加载器按文件名定序并采纳已知槽位，早上/晚报得到各自独立的期次 URL（静态构建里两者同写一个 `-None` 文件、晚报覆盖早报）。已知差异（均为呈现层）：来源头像用字母片（动态版不抓 favicon）、数据源页未分页（静态每页 20 个）、ABOUT/LANDING 里的站内链接改指 web 路由。
- **P2b 存储适配（2026-11-16）**：`apps/web` 数据层改为存储接口（`lib/store.ts`）：文件后端（数据目录直读，即 P2a 行为）与 SQLite 后端（`BD_DB_PATH`）并存，D1 后端（`lib/store-d1.ts`）共用同一份 DDL、待 P2c 切换时接绑定。导入器 `scripts/import.ts`：期次/台账/config 原样入库 + 派生的话题/出现行（导入时由 core 的 buildTopics 算好，重启不再重付台账匹配的平方级成本——压测里它占一年量全量构建 35 秒中的 18.5 秒）；导入后逐项核对（期次载荷逐字、话题数、slug 集合、每话题出现序列、全期次看板史）。看板状态改增量计算（一遍扫过期次、只更新当期触及的话题），与原朴素算法在官方数据 8 期 + 金融 demo 上逐期全等（排名/浪高/双增量/结转标记）。SQLite 驱动选型实测：vite preview 实际跑在 Node 的 ESM loader 下（bun x 启动亦然），`bun:sqlite` 不可用；改用 Node ≥22.5 与 Bun 都内建的 `node:sqlite`，一份实现通吃。官方数据导入实测：8 期 / 64 条 / 50 话题全核对 PASS，库 0.4MB；DB 后端下三语海浪榜与静态构建逐行一致、金融 demo 的 investor 行为一致。
- **P2a 动态前端起步（2026-11-16）**：新增 `apps/web`（`@breaker-delta/web`）——基于 vinext 1.4.5（Next.js API on Vite）的 App Router 应用，与 P1 薄 serve 的定位不同：这是框架迁移的正主，同一套代码可出 Cloudflare Workers（官方实例）与 Node（Docker/自托管）两种产物（`BD_TARGET=cf` 切换）。数据层直接复用 `@breaker-delta/core` 的话题构建/浪高/分类与发布器的字符串表、样式表（publisher 索引新增常量再导出，两边共用一份，不再各存副本）；看板状态（结转估值 + 浪高/排名增量）按 build.ts 同算法移植。已落地路由：`/{lang}` 海浪榜（带 `?e=<n>` 历史期次直达——动态形态原生能力）、`/{lang}/topic/{slug}` 话题页、`/{lang}/category/{key}` 分类页（zh/en/ja）。**内容对齐验收**（官方数据同一目录、静态构建为基准）：三语海浪榜 50 行（排名/标题/浪高）逐行一致；50 个话题页的 creator 面板文本逐字一致；金融 demo 数据下 investor 面板 + 强制免责声明与静态版行为一致（有研判才出、无研判不出、空标的行跳过）。插件面板以结构化区块定义渲染成 React 组件——Plugin-P0 的区块模型在此兑现。存储仍是文件（P2b 迁 SQLite/D1 时页面不动）；页面家具（页脚/时间滑杆/主题切换等）与余下路由在 P2c 补齐。
- **Plugin-P0 切片 2：数据路径打通（2026-11-16）**：运行 Skill 新增步骤 5c「插件分级注入」——启用了数据插件时，分级 agent 按插件包的 `prompt.md`（口径与红线）+ `schema.yaml`（字段/枚举/必填）逐话题产出结构化研判，写进期次条目 `plugins.<id>`；凑不齐必填字段整份不产出，免责声明不进字段（发布器强制渲染）。透传实测：`serve` 的 `POST /api/editions` 整对象落盘，`plugins` 命名空间逐字保留、重渲染后面板出现（新增 serve 集成测试守着）。`doctor` 增插件检查：插件包损坏判 fail、config 启用不存在的插件判 fail（只提及未启用为 warn）、已启用数据插件的 schema 逐项验（字段名/类型/枚举值域/重名）。向导 Skill 新增 W4b「你打算拿话题干什么？」步（订阅源之后、试跑之前）：按行业给候选（写作→creator / 投资→investor / 追番→watchlist），都不合意可当场按声明式格式生成新插件草案落数据目录（两轮内定稿），W5 试跑把面板与研判口径连同分类一起摊开校准，W7 增「改插件」通道。端到端演示：金融 demo 实例（自拟分类 4+1、investor 启用）doctor 12 项全 ok、一期 3 话题成站——带研判的话题出「投资研判」面板 + 免责声明、无研判的话题只有创作参考、空标的列表自动跳过该行。测试 237 → 239。
- **Plugin-P0 声明式面板插件（2026-11-16，设计定稿当日实现）**：插件与 preset 正交——preset 管「看什么行业」，插件管「拿话题做什么」。插件包 = `plugins/<id>/`（plugin.yaml + panel.yaml，数据插件另加 prompt.md + schema.yaml），引擎仓内置、数据目录同 id 覆盖。publisher 新增结构化区块渲染器（subh / note / olist / tips / fields / disclaimer——区块是数据不是 HTML，P2 迁框架时同一份定义渲染成组件）；话题页面板槽改走插件注册表，启停分层与 preset 一致（config 的 `plugins:` 段，creator 默认开、数据插件默认关），`TS_CREATOR` / `--creator` 保留为 creator 的兼容别名。**creator 迁移验收（Gate A 标准）**：面板全部三语文案从 literals 迁入 `plugins/creator/panel.yaml`（脚本生成 + 子集解析器回读深比对，防手抄漂移），官方实例全量构建与迁移前快照逐项比对——内容零差异（仅源站 favicon 在线重抓的既有噪声，源页差异经图标名归一化后亦为零）。**investor（投资研判）与 watchlist（追番建议）两个声明式参考插件随框架落地**：分级产出存条目 `plugins.<id>` 命名空间（core 话题构建透传，无数据整块不渲染——不拼假建议），investor 带强制渲染的免责声明、prompt 红线不给买卖点位与仓位。分级注入（运行 Skill 按 prompt+schema 产出）与向导插件步、doctor 插件检查为紧随的第二片。测试 233 → 237（发布器 +2 渲染器单测、CLI +2 端到端：creator 定义渲染与 TS_CREATOR=0 回归、investor 有数据才出面板 + 免责声明在场）。
- **P0 preset 抽取（2026-11-16）**：分类规则（原 `classify.ts` 写死的 CAT_RULES）搬进 preset——`presets/ai-tech/` 一包（源清单 / 主题权重 / 关键词默认 / `categories` 分类段 / `brief.md` 行业简报）；引擎只留分类算法与一份内置默认兜底，`catRulesFromConfig` 解析 config 的 categories 段（三种写法 + 自定义 fallback 与多语言名）。配置分层落地：preset 默认 ← 实例 config.yaml ← 环境变量。CLI 新增 `preset list` / `preset init <名>`；`doctor` 增分类完整性检查（categories 段解析不出有效规则判 fail，不再静默回退）与 `--online` 源可达抽查（每组抽 3、死源只 warn）。官方实例全量回归 677 文件逐字节零差异（Gate A）。顺带修复真 bug：未知分类原本全被映射到同一个 category-industry.html 互相覆盖，改为按分类名 slug 化。
- **Skill 按职责拆分（2026-11-16）**：运行 Skill（`skills/breaker-delta/`）只留扫描流程；新建 `skills/breaker-delta-setup/` 向导 Skill（行业访谈 → 分类共创 → 关键词/权重 → 订阅源发现与实测 → 落盘试跑校准 → 模式 A 托管 / B 部署分岔 → 增量重入）；PR Watch 章节移出产品仓（Dai 个人 custom skill）。发版打包同时收入两个 Skill。向导与品牌文案不写死扫描频次（用户自定）。
- **砍 topic-tNN 跳转桩页（2026-11-16）**：slug 化时给旧地址留的 noindex 跳转存根删除，官方实例 677 → 548 文件，其余逐字节零差异；一年量下 Cloudflare Pages 2 万文件撞线由约第 11 个月推迟到约第 20 个月。旧 tNN 链接（仅 slug 切换前一天分享过的）会 404，站内链接/feed/sitemap 本就全走 slug。
- **P1 动态服务与 Docker（2026-11-16，路线甲：框架迁移绑 P2）**：publisher 新增 sink 抽象与 `renderSiteMap`——同一套模板既可落盘静态构建（与旧产物逐字节等价，有等价测试守着）也可渲染进内存映射。CLI 新增第九个命令 `serve`（node:http 薄服务）：内存托管全部页面、数据指纹轮询自动重渲染（带竞态 catch-up）、`POST /api/record` 与 `POST /api/editions` 推送 API（Bearer `BD_PUSH_TOKEN` 鉴权，未设口令 403、错口令 401）、`GET /api/health`、`BD_SCAN_TIMES` 内置抓取调度（只抓候选，分级仍归外部 agent 推送——自部署默认主线，Dai 定案）。仓库根 `Dockerfile`（两段构建，oven/bun）+ `docker-compose.yml` + `.env.example`；镜像已在 Dai 的 Mac（OrbStack）实测：全新 clone + 官方数据，构建 13 秒，脚本化验收 9/9 PASS。
- **P2 Cloudflare 模板（Beta，2026-11-16）**：`templates/cloudflare-pages/`——git 连接 Pages（构建命令与官方实例线上原样一致，经 API 读回核对）与 wrangler 直传两条路 + build.sh（本地端到端实测 548 文件成站）；连接/上传半段依赖用户账号，未纳入项目实测，标 Beta，Docker 为主推。
- **落地页（2026-11-16）**：主站新增 `landing.html`（三语）：Hero（resonance-not-volume 定位 + Live board / Deploy / GitHub 三 CTA）、How it works 五步、证据区（指向公开战绩台账，数字待 2026-11-25 首轮复核后填，代码里标 EVIDENCE-NUMBERS）、对比表（vs Google Trends / Feedly）、FAQ 五问、Roadmap preset 投票。正文在 literals 的 LANDING（`{{DOCS}}` 按实例展开），llms.txt 已链，sitemap 自动收录。
- **文档补充（2026-11-16）**：快速开始页置顶 Docker Quickstart 五步（agent 推送主线，本地 Bun 降为「本地模式」）；部署页加 Docker 一节与 CF 模板指引；CLI 参考补 serve（命令数八→九）；新增扩展隐私政策页 `docs-extension-privacy.html`（Web Store 提交用）。README 中英重排（30 秒 pitch、Quickstart 置顶、Presets 节、命令清单更新）。
- **LICENSE（2026-11-16）**：Apache License 2.0（Dai 拍板：暂时采用，保留之后商业化考量；代码可用、品牌不授予）。

- **全量迁移到 Bun（Dai 定，2026-11-16）**：包管理、测试、打包、运行全部从 Node/npm 切到 Bun ≥ 1.2（本机 Bun 1.4.4 实测）。`bun install` 生成 `bun.lock` 为权威 lockfile（由 package-lock 迁移）；根与五个包的 scripts 改为 `bun run --filter` / `bun test`（现有 node:test 套件 Bun 直接接管，全量 **209/209** 通过，总耗时约 9 秒）；CLI 与扩展的打包脚本从 esbuild 改为 `Bun.build`（CLI target bun、shebang 改 `#!/usr/bin/env bun`，扩展 iife），esbuild 依赖移除；doctor 的版本检查改为 `runtime`（Bun ≥ 1.2 优先，Node ≥ 20 兜底）；CLI 测试改用 `process.execPath` 启动 bundle（跟随当前运行时）；release/bump 脚本与 release.yml（oven-sh/setup-bun）同步切换，bump 同时同步 bun.lock 与 package-lock；README / RELEASING / SKILL / 站内文档的运行时字样统一改为 Bun。**过渡安排**：package-lock.json 暂时保留并保持同步——数据仓的 GitHub workflow（现网构建）仍用 npm ci，等 Cloudflare 切换完成后再删；Cloudflare 两个项目的构建命令已同步改为 Bun 版（构建镜像无 Bun，先 `npm i -g bun` 引导）。扫描 cron 的执行指令同步改用 bun 运行 bundle。（迁移收尾：Cloudflare 两个 Pages 项目已于当日经 API 按 docs-site/cloudflare.md 建好，docs.breakerdelta.com 已绑定文档项目；期间误删建的同名 Hello World Worker 已删除。）（切换完成：Dai 在后台手动触发首批构建后两站上线，根域名 breakerdelta.com 绑定并验证；缺失的 GitHub App 仓库授权补上后推送自动构建恢复（`github:push` 实测）；数据仓 GitHub Pages workflow 已停用；package-lock.json 随之退役删除，bump 不再同步 npm lockfile。）

- **托管改投 Cloudflare Pages（路线 A：项目直连仓库原生构建）**：Dai 定迁移到 Cloudflare Pages 并选原生构建路线。`docs-site/` 相应改版：删 GitHub Actions 的 pages.yml 模板，新增 `cloudflare.md` —— 两个 Pages 项目的完整配置（文档项目连引擎仓跑 docs 命令、主站项目连数据仓且构建时 clone 公开引擎仓，两条构建命令已于 2026-11-16 用全新 clone 本地模拟验证：文档 27 页、主站 canonical 落在 breakerdelta.com 且无站内文档页）与上线/切换清单（域名 DNS 先上 Cloudflare → 两项目 pages.dev 验证 → 绑自定义域名 → 才推引擎拆分提交 → 最后停用数据仓的 GitHub Pages workflow 防双部署）。`breaker-delta-docs` 薄仓不再需要（Cloudflare 允许多个项目连同一个仓，GitHub Pages 的一仓一站限制消失）。文档部署页同步加注官方实例已迁 Cloudflare、构建命令不变。数据分仓与域名布局不变；引擎拆分提交仍未推送，等 Cloudflare 两站就绪后按清单顺序执行。

- **文档拆成独立站 docs.breakerdelta.com，域名布局落定**：Dai 定：文档单独建站、不跟主体占一个站点；域名用 breakerdelta.com，文档在 docs.breakerdelta.com，主体放根域名 breakerdelta.com，app.breakerdelta.com 预留给将来的登录型产品。实现：发布器新增 `buildDocsSite`（独立外壳 mastDocs/footDocs、自己的 canonical/hreflang/sitemap、每语言一个 index 跳转桩、品牌文件自带，正文里指向主站页面的相对链接在构建时改写成 TS_MAIN_URL 绝对地址，默认 https://breakerdelta.com/），CLI 新增第七个命令 `docs`（只需引擎根目录、不读数据目录；--docs-url/--main-url/--out 与 TS_DOCS_URL/TS_MAIN_URL/TS_DOCS_OUT）；主站构建不再生成任何文档页（每语言页数回到 22 页口径），顶部导航与页脚的「文档」改为外链到 TS_DOCS_URL（默认 https://docs.breakerdelta.com/），llms.txt 同步。docs 内容同步更新：CLI 参考补 docs 命令与两个新环境变量（六命令改七命令），部署页新增「域名布局」一节。引擎仓新增 `docs-site/`（给未来 daiyanze/breaker-delta-docs 仓的 pages.yml 模板 + 建站清单，含 DNS 记录与上线顺序）。测试：发布器 10 → 11（主站无文档页 + 导航外链断言、独立文档站 27 文件与改写断言），CLI 7 → 8（docs 命令 + 页数断言回到 22/66）。**上线时序（重要）**：必须先建 docs 仓并让 docs.breakerdelta.com 真正可访问，再推引擎并重建主站——否则主站下一次重建（含扫描触发）就会撤掉站内文档、导航指向尚不存在的文档站。

- **站点新增整套文档页（中英双语）**：Dai 指出 Breaker Delta 还缺一套提供用法说明的 doc 页面。发布器新增 `packages/publisher/src/docs.ts`（双语内容源，事实均对齐 README / CLI --help / config.example.yaml / SKILL.md / 扩展 README / 数据仓 workflow，不新编命令），构建时生成 8 个页面 × 语言：总览 `docs.html`、快速开始、看懂站点、CLI 参考、配置、Skill 与 MCP、Chrome 扩展、自建与部署；每页带文档子导航（tagchips），互相链通并链回站点各页与仓库深层文档（方法论 / SOURCES）。顶部导航在「关于」之后新增第 10 个标签「📖 文档 / Docs / ドキュメント」（literals 三语 tabs 末尾追加，下标 0–8 不动，render hrefs/keys 同步，页脚同步加文档链）；日文站按「暂时中英双语」口径渲染英文正文并在页首加「日本語版は準備中です」提示，导航与 hreflang 保持有效。sitemap 自动收录全部文档页，llms.txt 增文档入口，README / README.zh-CN 文档索引同步加链。测试：发布器新增双语与日文兜底断言（9 → 10），CLI 的 publish 页数断言同步更新（每语言 22 → 30 页、总页数 66 → 90）；全仓 207 测试全过，并已用数据仓真实数据本地构建核对（每语言 170 → 178 页、三语共 534 个 HTML，导航顺序、文档页高亮、sitemap 24 条文档记录均正确）。上线需引擎推送后由数据仓 CI 重建站点（或手动 dispatch 其 Pages workflow）。

- **站点导航加「投波」内链**：Dai 指出投波页此前只能从回波页/关于页的 CTA 进入、顶部菜单里没有。三语顶部导航在「回波」之后新增「🌀 投波 / Submit / エコー投稿」标签，链到 `submit.html`，投波页自身会高亮该标签。实现：literals 三语 tabs 各插入一项，render 的 hrefs/keys 同步插入 `submit.html`/`submit`，build 里 tabs 下标引用顺移（分类/数据源/战绩/归档/关于），投波页 mast 的 active 键由空改为 `submit`；发布器测试新增三语导航与高亮断言，全仓 206 测试全过，并已用数据仓真实数据本地构建核对（170 页 × 三语，导航顺序与高亮正确）。上线需引擎推送后由数据仓 CI 重建站点（或手动 dispatch 其 Pages workflow）。
- **扩展 0.6.1（修）**：Dai 实测 popup 页脚「⚙ 设置」点击无反应。代码与打包产物复查无误（处理函数、元素 id、manifest `options_ui` 都在），疑似 `chrome.runtime.openOptionsPage()` 在其 Chrome 上静默失败；改为双保险：先调 openOptionsPage 并捕获其 promise 失败，失败即用新标签页直接打开 `options.html` 兜底；同时在 init 时把设置链接的 href 写成设置页真实地址。待 Dai 重新加载扩展后复验。
- **SKILL 新增「PR 检查与合并（PR Watch）」章**：与扫描流程分离的附带职责——巡检两仓 open PR，按改动范围分档：A 档（仅数据/文档路径、无冲突、数据 JSON 可解析、head 的 workflow 运行全 success 时）可 squash 自动合并并留痕评论；B 档（任何代码/workflow/配置改动等）只检查、评论并汇报 Dai；疑似密钥/数据入引擎仓等直接拦截汇报。配套：`gh_api.py` 新增通用 `call` 子命令打通评论/合并；手动首轮巡检已跑（两仓均无 open PR、无历史 PR）。实测约束已写入 skill：当前细粒度 token 无 Checks/Statuses 权限（接口 403），检查状态改查 `actions/runs?head_sha=`；两仓暂无 PR 触发 CI，A 档在无运行记录时靠本地数据校验放行，加 PR CI 后豁免自动失效。
- **扩展 0.6.0（自有版本线，引擎版本不变）**：新增设置页（`options_ui`）：投波目标数据仓（默认 `daiyanze/breaker-delta-data`，接受 owner/repo 或 github.com 地址）、实例站点地址、收波后立即投波、投波后保留本地副本四项设置，存 `chrome.storage.local` 的 `settings` 键。一键投波：每条回波旁「🌀 投波」与回波箱「🌀 逐条投波」用 GitHub 官方预填参数（`template=echo.md` + `title` + `body`）打开数据仓新建 Issue 页，标题/正文/标签自动填好，用户只需点 Submit——不需要令牌、不新增扩展权限；摘录按预算截断保证链接不超 GitHub 长度上限，打开后回波标记 `issueOpenedAt`（或按设置删除本地副本），逐条投波由 background 逐条开页以绕开 popup 关闭问题。数据改实时：background 在安装/启动时、popup 在打开时从设置里的实例站点拉取 `data/topics.json` / `data/alerts.json` 存入 `dataCache` 缓存，角标与徽章优先用缓存，打包快照只做兜底；话题页链接改用设置里的站点地址。权限不变（仍只有 activeTab/storage/scripting），隐私口径同步更新（只从配置的实例站点下载公开 JSON，不发送任何数据）。扩展测试 14 → 24，全仓 206 个全过。

## 0.22.0 — 2026-11-15（术语改名：种子 / 苗头 → 回波）

- **改名（Dai 定）**：收集早期信号的整套术语由「种子 seed / 收苗 / 投苗 / 苗头」改为「回波 echo / 收波 / 投波 / 回波」，与主标语「浪起之前，先有回波」和雷达原理统一——收集回波，观测它之后是否成浪。等级 emoji 🌱 → 🌀。英文 Seed/Seeds → Echo/Echoes，日文 芽生え → エコー。站点三语 UI、方法论与 README、SKILL、配置示例（levels 与 `max_seedlings` → `max_echoes`）、Issue 模板（`seed.md` → `echo.md`，label `seed` → `echo`）、banner SVG 同步改名。
- **等级键 seed → echo，旧数据兼容**：core 在话题构建时把历史 editions 里的 `level: "seed"` 归一为 `"echo"`，浪高基分两者同为 10；台账 emoji 🌱 与 🌀 都解析为 echo。数据仓的历史 editions 与台账原文不改。golden fixture 同步迁移（`level` 与保留文件名列表新增 `echoes`）。
- **页面 URL**：苗头页 `seeds.html` → `echoes.html`，旧地址由发布器生成跳转桩（meta refresh + canonical）保持可用；等级页 `level-seed.html` → `level-echo.html`。
- **扩展 0.5.0**：Echo Catcher / 收波——popup、回波箱、投波导出、JSON 文件名（`breaker-delta-echoes.json`）全量改名；本地存储键 `seeds` → `echoes`，旧收件箱在首次打开 popup 时自动迁移，不丢数据。
- 引擎版本 0.21.0 → 0.22.0；扫描 cron 走 SKILL.md，改名随 Skill 自动生效（grade 写回改用 `echo`，旧 `seed` 台账记录为历史保留）。

## 0.21.0 — 2026-11-15（未发布，Python 退役 · Node-only 首个版本）

- **Python 退役**：生产已切换 Node（数据仓 CI 用 CLI bundle 构建、早晚扫描 cron 走 Node CLI + 新 SKILL.md），本版删除 Python 引擎全部：`radar/`（引擎源码 + 25 个抓取器）、`tests/`（pytest 52 测试）、`pyproject.toml`、迁移脚本 `scripts/` 全部（黄金样本与字面量生成、构建 diff、双跑临时封装，正式 CLI 已取代）、骨架期遗留的 `.github/workflows/radar.yml`（带 06:00/18:00 JST 定时且仍在触发，但被 `RADAR_ENABLED` 变量门控、历次运行均 skipped，从未真正执行）。合计 49 个跟踪文件、约 6,457 行。删除前已打回滚标签 `v0.15.1-python-final`（本地 + 远端），回滚方法见 `NODE-MIGRATION.md`「Python 退役」节。
- **favicon-cache 迁出**：`radar/favicon-cache/` → 仓库根 `favicon-cache/`；publisher 默认路径、CLI 引擎根探测标记、doctor 检查项与帮助文案同步更新，Node 代码不再引用 `radar/` 路径（core/fetchers 源码里 "ported from radar/…" 的溯源注释保留，那是历史出处而非路径引用）。
- **清理**：引擎根残留 `state/`（旧 candidates 与基线副本，基线已归数据仓）、`site/` 旧构建产物、`tripple_signals.egg-info/`、`.pytest_cache/`、`__pycache__/` 删除；`.gitignore` 移除 Python 条目（`__pycache__/`、`*.pyc`、`.pytest_cache/`、`*.egg-info/`），`radar/favicon-cache/` 改为 `favicon-cache/`。
- **golden fixture 冻结**：`packages/core/fixtures/golden.json` 等黄金样本保留为冻结的历史行为样本（生成器已删），core/fetchers 测试继续据此断言；npm 测试仍 196 个全过。
- 根 `package.json` 与 core/fetchers/publisher/cli 及 `.claude-plugin/plugin.json` 版本升 0.21.0（扩展自有版本线仍 0.3.0，仅其对 core 的依赖规格跟随升 0.21.0）。
- **发布流程建立**：新增 `scripts/release.mjs`（发布前逐项核对全仓版本戳——根/各包/plugin.json/CLI VERSION 常量同为引擎版本、扩展 manifest 与其 package.json 一致——再跑全量测试并暂存四件产物到 `release-dist/`：单文件 CLI `breaker-delta-<版本>.mjs`、Skill 包 `breaker-delta-skill-<版本>.zip`（SKILL.md + plugin.json + CLI 单文件，按仓库布局打包）、扩展包 `breaker-delta-extension-<扩展版本>.zip`（manifest 在 zip 根、不含实例数据）、`SHA256SUMS.txt`，并从本文件抽取对应版本章节生成 `RELEASE_NOTES.md`）；新增 `scripts/bump.mjs`（一键升引擎版本：各 package.json 版本与内部依赖规格、plugin.json、CLI VERSION 常量、package-lock 同步；扩展自有版本线不动）；新增 `.github/workflows/release.yml`（推 `v*` 标签触发：测试→打包→以 CHANGELOG 章节为正文创建 GitHub Release；手动触发只构建并上传 artifact 作预演，不建 Release）；流程文档 `RELEASING.md` / `RELEASING.zh-CN.md`。本地全流程实跑通过：196 测试全过，三件产物生成并验 SHA-256，单文件 CLI 独立目录 doctor 9/9（带 `--root-dir`）。

## 0.20.0 — 2026-11-15（未发布，Node 迁移 Phase 5，迁移收官）

- **Phase 5 `@breaker-delta/extension`**：Chrome 扩展自 `extension/` 迁入 monorepo 的 `apps/extension`，源码改 TypeScript（strict）——`src/popup.ts` / `src/content.ts` / `src/background.ts`，纯逻辑抽到 `src/logic.ts`（页面匹配、角标计数与角标文本、话题链接构建、收苗记录构建与 Issue 文本格式）。esbuild（devDependency）打包 + 静态文件拷贝产出 `apps/extension/dist/`：可直接「加载已解压的扩展程序」的完整目录（dist 不入仓）；扩展版本 0.3.0（manifest + package.json）。
- **删手抄、引 core**：话题/提醒的数据形状改用 `@breaker-delta/core` 的 `TopicDataEntry` / `AlertEntry` 类型（与发布器生成 topics.json/alerts.json 的同一套类型）；扩展运行时不计算 slug/浪高/分词（topics.json 里的 slug、heat、url_patterns、title_keywords 都是发布器用 core 算好的），src 与打包产物经 grep 自证无 slugify / heat / tokens 的手抄实现。core 仅作类型层引入：其索引含需要 node:fs 的 store/vocab 模块、进不了浏览器打包，故话题页文件名规则在 logic 里按 core `topicFile` 的定义对齐（`${slug}.html`），未扩 core API。
- **修两处漂移**：徽章「查看话题」链接基址由旧的 `daiyanze.github.io/breaker-delta/` 改为现行站点 `daiyanze.github.io/breaker-delta-data/`；文件名由占位形式 `topic-<slug>.html` 改为发布器实际产物 `<slug>.html`（topics.json 无 url/path 字段，故按 slug 构建；线上实测该形式返回 200）。manifest 的 permissions / host matches / web_accessible_resources 不变，UI 文案与样式不变，匹配口径与角标规则（alerts 条数）与 0.2.1 一致。
- **测试与验收**：`apps/extension/test` 新增 14 个 node:test（合成 fixture，与真实快照同构：匹配命中/不命中、首命中顺序、角标计数、链接 URL 断言、收苗 payload 形状、畸形数据解析回退）。本地验收（不入仓）：构建产物对真实快照（2026-11-14 期，33 话题 / 4 alerts）跑匹配与角标——角标数 4、33/33 话题可被自身 pattern/标题命中。侧载副本 `~/workspace/breaker-delta-extension/` 已刷新为新产物并注入线上当前 data（generated_at 2026-11-14T06:00+09:00，33 话题 / 4 alerts，加载后角标应为 4），待 Dai 在真实 Chrome 里侧载实测。
- 根 `package.json` 与 core/fetchers/publisher/cli 版本升 0.20.0（扩展包自有版本线 0.3.0），根 build/test 脚本串联五个包；npm test 共 196 个全过（core 109 + fetchers 57 + publisher 9 + cli 7 + extension 14），Python `pytest` 仍 52 全过。**Node 迁移五期全部完成**：Python 引擎原样保留，线上 cron 与数据仓 CI 的切换、Python 退场仍待 Dai 单独拍板（见 `NODE-MIGRATION.md` 收官总结）。

## 0.19.0 — 2026-11-15（未发布，Node 迁移 Phase 4）

- **Phase 4 `@breaker-delta/cli`**：统一命令行 `breaker-delta`（`apps/cli`，依赖 core + fetchers + publisher）——全局参数 `--data-dir`（或 `BD_DATA_DIR`）/ `--config` / `--root-dir`（或 `BD_ROOT_DIR`，缺省自文件位置向上探测引擎根）/ `--json`；退出码 0/1/2（成功 / 运行错误 / 用法错误），`--json` 时 stdout 只输出一个 JSON 文档（publish 的构建日志改走 stderr）。五命令：`scan`（调 fetchers 的 runScan，summary 与收尾两行同 Python `__main__`，仅收尾提示改指新 SKILL.md；无命令时默认 scan，同 Python 的一命令路径）、`review`（列表格式同 Python）、`record`（**新增的正式写回接口**：输入 JSON 数组 `[{name, sources, grade}]`，逐条调 core 的 upsertTopic 并原子保存，替代 SKILL 里让 agent 直调 `store.py` 的旧法；子命令 `record review --name <话题> --result hit|miss` 回填复核结果，报错语义同 Python 的 record_review）、`publish`（调 publisher 的 buildSite，`--out/--base-url/--data-repo/--langs/--creator` 与 `TS_*` 环境变量叠加：显式参数 > env > 默认；引擎/data 分工：assets 与 favicon-cache 在引擎侧，editions/state/track-record/config 在 data-dir 侧，config 原文块先 data-dir 后引擎侧回退，与 Python `load_config_blocks` 的回退链对齐）、`doctor`（离线自检：node ≥ 20、config 定位与解析、editions 计数、state 可写、seen-topics.json 合法性、track-record.md 缺失只警告、assets/favicon-cache 可见；有 fail 时退出 1）。
- **MCP 对等**：`breaker-delta mcp` 的 stdio 服务与 `radar/mcp_server.py` 对等（protocolVersion `2024-11-05`，`radar_scan`/`radar_review` 的 schema 与返回文本格式一致，含未知方法 -32601 与工具错误 isError）；serverInfo 改为 `breaker-delta`/`0.19.0`；config 与 state 改从 `--data-dir`/`BD_DATA_DIR` 取（Python 版用进程 CWD）。
- **单文件打包**：esbuild（devDependency）把 CLI 打成 `apps/cli/dist/breaker-delta.mjs`（约 263 KiB，带 shebang、可直接执行，运行时零 node_modules），根目录 `npm run bundle` 一键产出。验收（已做，集成测试覆盖）：把单文件复制到只有它和 node 的空目录，对沙箱 data-dir 跑通 doctor / record / review / publish，publish 产物与包内构建逐文件一致。
- **Skill 改调 Node CLI**：`skills/triple-sigma/` 改名为 `skills/breaker-delta/`；SKILL.md 的方法论一字未动（git diff 自证：只改 frontmatter、标题、输入节、步骤 0 与步骤 5 的命令形态，并新增常用命令清单），写回改走 `record` 并给出 JSON 示例（grade 用真实台账的 `must`/`watch`/`seed`）；`.claude-plugin/plugin.json` 同步 name / skills 路径 / version（diff 仅 3 行）。线上早晚扫描 cron 与数据仓 CI 仍走 Python，本期未切换。
- 根 `package.json` 与各 workspace 版本升 0.19.0，根 build/test 脚本串联四个包；npm test 共 182 个全过（core 109 + fetchers 57 + publisher 9 + cli 7），Python `pytest` 仍 52 全过。

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
