// Docs pages (zh / en only for now): the usage guide for Breaker
// Delta, rendered as part of the static site. Content is sourced
// from the verified facts in README.md, the CLI --help text,
// config.example.yaml, skills/breaker-delta/SKILL.md, the extension
// README and the data-repo Pages workflow — do not invent commands
// or options here. The ja site renders the English body with a
// "Japanese coming soon" notice (see build.ts), so every page only
// needs zh and en bodies.

export interface DocPage {
  file: string;
  title: { zh: string; en: string };
  desc: { zh: string; en: string };
  body: { zh: string; en: string };
}

export const DOC_FILES: string[] = [
  "docs.html",
  "docs-getting-started.html",
  "docs-reading.html",
  "docs-cli.html",
  "docs-config.html",
  "docs-skill.html",
  "docs-extension.html",
  "docs-deploy.html",
];

const NAV_LABELS: Record<string, { zh: string; en: string }> = {
  "docs.html": { zh: "总览", en: "Overview" },
  "docs-getting-started.html": { zh: "快速开始", en: "Getting Started" },
  "docs-reading.html": { zh: "看懂站点", en: "Reading the Site" },
  "docs-cli.html": { zh: "CLI 参考", en: "CLI Reference" },
  "docs-config.html": { zh: "配置", en: "Configuration" },
  "docs-skill.html": { zh: "Skill 与 MCP", en: "Skill & MCP" },
  "docs-extension.html": { zh: "Chrome 扩展", en: "Extension" },
  "docs-deploy.html": { zh: "自建与部署", en: "Deploy Your Own" },
};

/** Sub-navigation chips shown at the top of every docs page. */
export function docsNav(lang: string, activeFile: string): string {
  const useLang = lang === "zh" ? "zh" : "en";
  let chips = "";
  for (const f of DOC_FILES) {
    const on = f === activeFile ? " on" : "";
    chips += `<a class="tagchip${on}" href="${f}">${NAV_LABELS[f][useLang]}</a>`;
  }
  return `<div class="tagchips" style="margin-top:14px">${chips}</div>`;
}

export const JA_DOCS_NOTICE =
  `<section class="panel"><div class="detail"><p>日本語版は準備中です。このページは英語版を表示しています。</p></div></section>`;

export const DOC_PAGES: DocPage[] = [
  {
    file: "docs.html",
    title: { zh: "📖 文档 · 总览", en: "📖 Docs · Overview" },
    desc: {
      zh: "浪尖雷达 Breaker Delta 使用文档总览：看懂站点、自己跑一台、用 Skill 让 agent 代跑、装 Chrome 扩展。",
      en: "Breaker Delta documentation overview: reading the site, running your own instance, the agent Skill and MCP, and the Chrome extension.",
    },
    body: {
      zh: `<section class="panel"><div class="panel-h"><span>这套文档是给谁的</span></div>
<div class="detail">
<p>浪尖雷达（Breaker Delta）是一个热点雷达：它从源头层抓取新模型、新产品、新仓库和新事件，用「浪高」给每个话题打分并持续追踪涨落。这套文档只讲<b>怎么用</b>，不讲愿景。按你的目的选一条路就行：</p>
<ul class="tips">
<li><b>只是来看热点的</b> → 先读 <a href="docs-reading.html">看懂站点</a>：每个页面在看什么、浪高怎么算、必看 / 关注 / 回波有什么区别。</li>
<li><b>想自己跑一台雷达的</b> → 从 <a href="docs-getting-started.html">快速开始</a> 开始，再看 <a href="docs-config.html">配置</a> 和 <a href="docs-deploy.html">自建与部署</a>。</li>
<li><b>想让 agent 代跑的</b> → 看 <a href="docs-skill.html">Skill 与 MCP</a>：把执行步骤交给 agent，你只定扫描频率和门槛。</li>
<li><b>刷网页时顺手收集信号的</b> → 看 <a href="docs-extension.html">Chrome 扩展</a>：一键收波、浪高徽章、一键投波。</li>
</ul>
<h3 style="margin:16px 0 6px">全部页面</h3>
<ul class="tips">
<li><a href="docs-getting-started.html">快速开始</a> — 环境要求、从克隆到跑出第一期、数据目录长什么样。</li>
<li><a href="docs-reading.html">看懂站点</a> — 海浪榜 / 涨潮榜 / 回波 / 分类 / 数据源 / 战绩 / 归档逐页说明，外加浪高公式与分级规则。</li>
<li><a href="docs-cli.html">CLI 参考</a> — scan / review / record / publish / docs / preset / doctor / mcp 八个命令、全局参数与退出码。</li>
<li><a href="docs-config.html">配置</a> — config.yaml 里真正会动到的开关：关键词三件套、主题权重、信息源开关、新词词汇表。</li>
<li><a href="docs-skill.html">Skill 与 MCP</a> — 把雷达装进 agent 工具（Claude Code、Codex 等），或把同一个程序当 MCP 服务器用。</li>
<li><a href="docs-extension.html">Chrome 扩展</a> — 安装、收波、投波、设置、权限与隐私、常见问题。</li>
<li><a href="docs-deploy.html">自建与部署</a> — 引擎仓 / 数据仓分工、建自己的数据仓、GitHub Pages 自动构建、上线后怎么更新。</li>
</ul>
<h3 style="margin:16px 0 6px">更深的资料（在 GitHub 仓库里）</h3>
<p><a href="https://github.com/daiyanze/breaker-delta/blob/main/skills/breaker-delta/SKILL.md" rel="noopener">SKILL.md</a>：agent 执行用的分层、门槛与复核规则完整版。 <a href="https://github.com/daiyanze/breaker-delta/blob/main/SOURCES.md" rel="noopener">SOURCES.md</a>：26 个内置抓取组的完整目录。 <a href="https://github.com/daiyanze/breaker-delta" rel="noopener">仓库 README</a>：项目结构与最新说明。本站文档暂时只有中文与英文，日文页面先显示英文版。</p>
</div></section>`,
      en: `<section class="panel"><div class="panel-h"><span>Who these docs are for</span></div>
<div class="detail">
<p>Breaker Delta is a hot-topic radar: it catches new models, products, repos and events at the source layer, scores every topic as a <b>wave height</b>, and tracks how that height rises and falls. These docs cover <b>how to use it</b>, nothing else. Pick the path that matches what you want:</p>
<ul class="tips">
<li><b>You just want to read the radar</b> → start with <a href="docs-reading.html">Reading the Site</a>: what each page shows, how wave height is calculated, and what Must / Watch / Echo mean.</li>
<li><b>You want to run your own radar</b> → start with <a href="docs-getting-started.html">Getting Started</a>, then <a href="docs-config.html">Configuration</a> and <a href="docs-deploy.html">Deploy Your Own</a>.</li>
<li><b>You want an agent to run it for you</b> → see <a href="docs-skill.html">Skill &amp; MCP</a>: the agent follows fixed steps; you only choose the schedule and the thresholds.</li>
<li><b>You spot signals while browsing</b> → see the <a href="docs-extension.html">Chrome Extension</a>: one-click echo capture, wave-height badges, one-click submit.</li>
</ul>
<h3 style="margin:16px 0 6px">All pages</h3>
<ul class="tips">
<li><a href="docs-getting-started.html">Getting Started</a> — requirements, from clone to your first edition, and what a data directory looks like.</li>
<li><a href="docs-reading.html">Reading the Site</a> — Wave Board / Rising / Echoes / Categories / Sources / Track Record / Archive, plus the wave-height formula and grading rules.</li>
<li><a href="docs-cli.html">CLI Reference</a> — the eight commands (scan / review / record / publish / docs / preset / doctor / mcp), global options and exit codes.</li>
<li><a href="docs-config.html">Configuration</a> — the config.yaml knobs people actually turn: keyword mute / boost / alert, topic weights, source switches, the new-term vocabulary.</li>
<li><a href="docs-skill.html">Skill &amp; MCP</a> — install the radar into an agent harness (Claude Code, Codex, …), or run the same bundle as an MCP server.</li>
<li><a href="docs-extension.html">Chrome Extension</a> — install, capture, submit, settings, permissions and privacy, troubleshooting.</li>
<li><a href="docs-deploy.html">Deploy Your Own</a> — the engine-repo / data-repo split, creating your own data repo, GitHub Pages builds, and how updates flow.</li>
</ul>
<h3 style="margin:16px 0 6px">Deeper material (in the GitHub repo)</h3>
<p><a href="https://github.com/daiyanze/breaker-delta/blob/main/skills/breaker-delta/SKILL.md" rel="noopener">SKILL.md</a>: the full layers, thresholds and review rules the agent executes. <a href="https://github.com/daiyanze/breaker-delta/blob/main/SOURCES.md" rel="noopener">SOURCES.md</a>: the full catalog of the 26 built-in fetcher groups. <a href="https://github.com/daiyanze/breaker-delta" rel="noopener">Repo README</a>: project layout and the latest notes. Docs are currently Chinese and English only; Japanese pages show the English version for now.</p>
</div></section>`,
    },
  },
  {
    file: "docs-getting-started.html",
    title: { zh: "📖 快速开始", en: "📖 Getting Started" },
    desc: {
      zh: "Breaker Delta 快速开始：Bun 1.2+、克隆、打包单文件 CLI、准备数据目录、doctor 自检、scan 与 publish。",
      en: "Breaker Delta getting started: Bun 1.2+, clone, bundle the single-file CLI, prepare a data dir, doctor, scan and publish.",
    },
    body: {
      zh: `<section class="panel"><div class="panel-h"><span>快速开始</span></div>
<div class="detail">
<p>先分清两个东西：<b>引擎</b>是代码（抓取、算浪高、生成站点），<b>数据</b>是你的实例自己的东西（每一期、话题台账、战绩、配置）。引擎仓里不存任何实例数据；你跑出来的数据放在你自己的<b>数据目录</b>里。只看公开站点不需要装任何东西，这一页是给要自己跑的人的。</p>
<h3 style="margin:16px 0 6px">环境要求</h3>
<ul class="tips"><li>Bun ≥ 1.2。除此之外没有运行时依赖，不需要数据库、不需要服务器。</li></ul>
<h3 style="margin:16px 0 6px">第 1 步：拿到引擎并打包</h3>
<pre class="cfgpre full">git clone https://github.com/daiyanze/breaker-delta.git
cd breaker-delta
bun install
bun run bundle        # 产出 apps/cli/dist/breaker-delta.mjs（单文件）</pre>
<p>后面所有命令都通过这个单文件跑，下文记作 BD：</p>
<pre class="cfgpre full">BD="bun apps/cli/dist/breaker-delta.mjs"</pre>
<h3 style="margin:16px 0 6px">第 2 步：准备数据目录</h3>
<p>最快的办法是照着现成的数据仓 <a href="https://github.com/daiyanze/breaker-delta-data" rel="noopener">daiyanze/breaker-delta-data</a> 的形状建一个自己的目录（或直接克隆它再换成自己的数据）。一个数据目录长这样：</p>
<pre class="cfgpre full">your-data/
  config.yaml        # 你的配置（可从引擎的 config.example.yaml 复制改）
  editions/          # 每一期的结果文件
  state/             # 话题台账、词汇表与 sitemap 基线（程序自动维护）
  track-record.md    # 战绩台账（必看/关注的登记与 14 天复核结果）</pre>
<h3 style="margin:16px 0 6px">第 3 步：自检、抓一期、生成站点</h3>
<pre class="cfgpre full">$BD --data-dir /path/to/your-data doctor                    # 离线自检
$BD --data-dir /path/to/your-data scan --edition morning    # 抓一期的候选
$BD --data-dir /path/to/your-data publish --out site        # 生成静态站点</pre>
<ul class="tips">
<li><b>doctor</b> 先跑：它离线检查 Node、配置、数据目录和引擎根目录，有问题会直接指出，退出码为 1。</li>
<li><b>scan</b> 只负责确定性抓取：它把候选写到 <span style="font-family:var(--mono)">state/candidates-日期-期次.json</span> 并逐源报告状态。把候选判成必看 / 关注 / 回波是 agent 按方法论做的事（见 <a href="docs-skill.html">Skill 与 MCP</a>），判完用 record 写回台账。</li>
<li><b>publish</b> 把数据目录里的期次和台账生成完整静态站点，输出目录里直接就是可以部署的 HTML。</li>
<li>每个命令都可以加 <span style="font-family:var(--mono)">--json</span> 得到机器可读输出；不带命令直接跑等于 scan。</li>
</ul>
<p>下一步：用 <a href="docs-config.html">配置</a> 把信息源和关键词调成你的行业，用 <a href="docs-deploy.html">自建与部署</a> 把站点挂到 GitHub Pages 上自动更新。</p>
</div></section>`,
      en: `<section class="panel"><div class="panel-h"><span>Getting Started</span></div>
<div class="detail">
<p>First, keep two things apart: the <b>engine</b> is code (fetching, wave-height scoring, site generation); the <b>data</b> belongs to your instance (editions, the topic ledger, the track record, your config). The engine repo stores no instance data; everything you produce lives in your own <b>data directory</b>. Reading the public site needs no install at all — this page is for people who want to run their own.</p>
<h3 style="margin:16px 0 6px">Requirements</h3>
<ul class="tips"><li>Bun ≥ 1.2. No other runtime dependencies, no database, no server.</li></ul>
<h3 style="margin:16px 0 6px">Step 1: get the engine and bundle it</h3>
<pre class="cfgpre full">git clone https://github.com/daiyanze/breaker-delta.git
cd breaker-delta
bun install
bun run bundle        # builds apps/cli/dist/breaker-delta.mjs — a single file</pre>
<p>Every command runs through that single file; below it is called BD:</p>
<pre class="cfgpre full">BD="bun apps/cli/dist/breaker-delta.mjs"</pre>
<h3 style="margin:16px 0 6px">Step 2: prepare a data directory</h3>
<p>The fastest route is to copy the shape of the working data repo <a href="https://github.com/daiyanze/breaker-delta-data" rel="noopener">daiyanze/breaker-delta-data</a> (or clone it and replace the data with yours). A data directory looks like this:</p>
<pre class="cfgpre full">your-data/
  config.yaml        # your config (copy the engine's config.example.yaml and edit)
  editions/          # one result file per edition
  state/             # topic ledger, vocabulary and sitemap baselines (maintained by the program)
  track-record.md    # the pick ledger and its 14-day review results</pre>
<h3 style="margin:16px 0 6px">Step 3: check, scan one edition, build the site</h3>
<pre class="cfgpre full">$BD --data-dir /path/to/your-data doctor                    # offline self-check
$BD --data-dir /path/to/your-data scan --edition morning    # fetch one edition's candidates
$BD --data-dir /path/to/your-data publish --out site        # build the static site</pre>
<ul class="tips">
<li>Run <b>doctor</b> first: it checks Node, the config, the data dir and the engine root offline, names any problem, and exits 1 on failure.</li>
<li><b>scan</b> is deterministic fetching only: it writes candidates to <span style="font-family:var(--mono)">state/candidates-&lt;date&gt;-&lt;edition&gt;.json</span> and reports per-source status. Grading candidates into Must / Watch / Echo is the agent's job under the methodology (see <a href="docs-skill.html">Skill &amp; MCP</a>); graded picks are written back with record.</li>
<li><b>publish</b> turns the editions and ledger in the data dir into a complete static site, ready to deploy as-is.</li>
<li>Every command accepts <span style="font-family:var(--mono)">--json</span> for machine-readable output; running with no command is the same as scan.</li>
</ul>
<p>Next: tune sources and keywords to your field in <a href="docs-config.html">Configuration</a>, and put the site on GitHub Pages with <a href="docs-deploy.html">Deploy Your Own</a>.</p>
</div></section>`,
    },
  },
  {
    file: "docs-reading.html",
    title: { zh: "📖 看懂站点", en: "📖 Reading the Site" },
    desc: {
      zh: "Breaker Delta 站点导览：海浪榜、涨潮榜、回波、分类、数据源、战绩、归档分别看什么，浪高公式与必看/关注/回波分级。",
      en: "Reading Breaker Delta: what the Wave Board, Rising, Echoes, Categories, Sources, Track Record and Archive pages show, the wave-height formula and the Must/Watch/Echo grades.",
    },
    body: {
      zh: `<section class="panel"><div class="panel-h"><span>看懂站点</span></div>
<div class="detail">
<h3 style="margin:6px 0 6px">每个页面看什么</h3>
<ul class="tips">
<li><b><a href="index.html">海浪榜</a></b>：全部已知话题按浪高从高到低排名（每页 100 条）。顶部时间滑块可以回看任意一个时间点的榜单；没有在最新一期更新的话题会按上次浪高<b>结转</b>并标注，不会假装是新数据。</li>
<li><b><a href="rising.html">涨潮榜</a></b>：和上一个时间点相比浪高涨幅最大的话题，新上榜的话题也计入。</li>
<li><b><a href="echoes.html">回波</a></b>：最近三期里首次出现、还在发酵的早期信号。回波大多只有一个来源，先记下来观察，不等于已经是热点。</li>
<li><b><a href="submit.html">投波</a></b>：把你发现的单源新信号投进来（标题、链接、一句理由），会打开一个已填好的 GitHub Issue，你确认后提交。</li>
<li><b><a href="categories.html">分类</a></b>：按安全 / 政策与监管 / 开源 / 商业与资本 / Agent 与应用 / AI 模型 / 行业动态浏览，也可以按必看 / 关注 / 回波等级看。</li>
<li><b><a href="sources.html">数据源</a></b>：每个来源贡献过哪些话题、出现多少次、覆盖多少期；点进单个来源能看到它的原始配置。</li>
<li><b><a href="track-record.html">战绩</a></b>：每一期必看与关注话题的事前登记台账。登记后 14 天复核一次：后来真的起来了记命中，没起来如实记未命中。</li>
<li><b><a href="archive.html">归档</a></b>：每一期的完整榜单快照，按日期回看。</li>
<li><b>话题页</b>（点任意话题标题进入）：正文、建议动作、数据源与原文链接（带 nofollow）、历史表，以及一张<b>海浪图</b>——它历次出现的浪高走势，图上的点可以点进对应那一期。话题页底部还有「创作参考」面板（短贴 / 长文大纲与写作提示），给要写这个话题的人用。</li>
</ul>
<h3 style="margin:16px 0 6px">浪高怎么算</h3>
<p>浪高不设上限，公式是：<b>等级基分 + 共振 + 证据 + 首现加分</b>。</p>
<ul class="tips">
<li>等级基分：🔥必看 60 / 👀关注 30 / 🌀回波 10</li>
<li>共振：每多一个<b>独立来源</b> +20。注意「独立」：官方博客组、科技媒体组、目录组内部不管多少家，整组只算 1 个来源，一篇通稿被转十次还是 1 个来源。</li>
<li>证据：每条原文链接 +8</li>
<li>首现：话题第一次出现 +25</li>
</ul>
<h3 style="margin:16px 0 6px">分级与共振规则</h3>
<ul class="tips">
<li>同一个话题被 <b>≥2 个独立来源</b>同时带到，才算热点候选；只有 1 个来源的先记为<b>回波</b>。</li>
<li>🔥 <b>必看</b>：共振强、相关性高，值得当天深入看或写出来。👀 <b>关注</b>：有 2 源共振或单源信号很强，先观察下一期涨不涨。🌀 <b>回波</b>：弱单源信号，只记一行。</li>
<li>信息是分层抓的：L1 源头层（官方博客、GitHub、Hacker News、Hugging Face、Product Hunt、arXiv 等）最先出现；L2 发酵层（Reddit、科技媒体、目录、Google News 等）确认扩散；L3 的 Google Trends 只做事后核对，从不用来发现话题。</li>
<li>排名变化（▲▼）和浪高变化都是和<b>上一个时间点</b>的全榜相比，不是和上一期同一话题的介绍相比。</li>
</ul>
<p>想知道每个数字背后的完整判定门槛（比如 GitHub 仓库要多少 stars/天才算爆发），门槛数字都在仓库的 <a href="https://github.com/daiyanze/breaker-delta/blob/main/config.example.yaml" rel="noopener">config.example.yaml</a> 里，分级规则在 <a href="https://github.com/daiyanze/breaker-delta/blob/main/skills/breaker-delta/SKILL.md" rel="noopener">SKILL.md</a> 里。</p>
</div></section>`,
      en: `<section class="panel"><div class="panel-h"><span>Reading the Site</span></div>
<div class="detail">
<h3 style="margin:6px 0 6px">What each page shows</h3>
<ul class="tips">
<li><b><a href="index.html">Wave Board</a></b>: every known topic ranked by wave height (100 per page). The time slider at the top replays the board at any earlier point in time. Topics not updated in the latest edition are <b>carried</b> forward at their last height and marked as such — never dressed up as fresh data.</li>
<li><b><a href="rising.html">Rising</a></b>: the biggest wave-height gains versus the previous point in time; newly listed topics count too.</li>
<li><b><a href="echoes.html">Echoes</a></b>: signals that first appeared in the last three editions and are still brewing. Most echoes have a single source — they are recorded to watch, not yet hotspots.</li>
<li><b><a href="submit.html">Submit</a></b>: send in a single-source signal you spotted (title, link, one-line reason). It opens a prefilled GitHub Issue; you review and submit it.</li>
<li><b><a href="categories.html">Categories</a></b>: browse by Security / Policy / Open Source / Business / Agents &amp; Apps / AI Models / Industry, or by Must / Watch / Echo level.</li>
<li><b><a href="sources.html">Sources</a></b>: which topics each source fed, how often it appeared, and across how many editions; a source's own page shows its verbatim config.</li>
<li><b><a href="track-record.html">Track Record</a></b>: the pre-registered ledger of every Must and Watch pick. Each pick is reviewed 14 days later: it took off = hit, it did not = miss, recorded either way.</li>
<li><b><a href="archive.html">Archive</a></b>: the full board snapshot of every edition, by date.</li>
<li><b>Topic pages</b> (click any topic title): the story, a suggested action, its sources and original links (nofollow), a history table, and a <b>wave chart</b> of its height over time — points on the chart link to the matching edition. Topic pages also carry a creator panel (short-post / long-form outlines and writing tips) for people who want to write about the topic.</li>
</ul>
<h3 style="margin:16px 0 6px">How wave height works</h3>
<p>Wave height is uncapped: <b>grade base + resonance + evidence + first-seen bonus</b>.</p>
<ul class="tips">
<li>Grade base: 🔥 Must 60 / 👀 Watch 30 / 🌀 Echo 10</li>
<li>Resonance: +20 per <b>independent source</b>. Independent matters: inside the official-blogs group, the tech-media group or the directory group, any number of outlets still counts as 1 source — one press release reprinted ten times is one source.</li>
<li>Evidence: +8 per original link</li>
<li>First seen: +25 the first time a topic appears</li>
</ul>
<h3 style="margin:16px 0 6px">Grading and the resonance rule</h3>
<ul class="tips">
<li>A topic carried by <b>≥2 independent sources</b> is a hotspot candidate; a single-source signal starts as an <b>echo</b>.</li>
<li>🔥 <b>Must</b>: strong resonance and high relevance — worth a deep look or a post the same day. 👀 <b>Watch</b>: two-source resonance or a strong single source — watch whether it grows next edition. 🌀 <b>Echo</b>: a weak single-source signal, one line only.</li>
<li>Sources are read in layers: L1, the source layer (official blogs, GitHub, Hacker News, Hugging Face, Product Hunt, arXiv, …) appears first; L2, the fermentation layer (Reddit, tech media, directories, Google News, …) confirms spread; L3 (Google Trends) is used only to verify after the fact, never to discover topics.</li>
<li>Rank and height deltas (▲▼) compare against the <b>previous point in time</b> across the whole board.</li>
</ul>
<p>For the full quantified thresholds behind every number (for example, how many stars/day a GitHub repo needs to count as a breakout), the threshold numbers live in the repo's <a href="https://github.com/daiyanze/breaker-delta/blob/main/config.example.yaml" rel="noopener">config.example.yaml</a> and the grading rules in <a href="https://github.com/daiyanze/breaker-delta/blob/main/skills/breaker-delta/SKILL.md" rel="noopener">SKILL.md</a>.</p>
</div></section>`,
    },
  },
  {
    file: "docs-cli.html",
    title: { zh: "📖 CLI 参考", en: "📖 CLI Reference" },
    desc: {
      zh: "Breaker Delta CLI 参考：scan、review、record、publish、docs、preset、doctor、mcp 八个命令，全局参数、publish 的 TS_* 环境变量与退出码。",
      en: "Breaker Delta CLI reference: scan, review, record, publish, docs, preset, doctor and mcp, global options, the TS_* publish environment variables and exit codes.",
    },
    body: {
      zh: `<section class="panel"><div class="panel-h"><span>CLI 参考</span></div>
<div class="detail">
<p>CLI 是单个自包含文件 <span style="font-family:var(--mono)">breaker-delta.mjs</span>（打包方法见 <a href="docs-getting-started.html">快速开始</a>），下文记作 BD。退出码：0 成功，1 运行时错误，2 用法错误。</p>
<h3 style="margin:16px 0 6px">全局参数（命令前后都可以放）</h3>
<pre class="cfgpre full">--data-dir &lt;dir&gt;   数据目录：editions/、state/、track-record.md、config.yaml|json
                   （默认：环境变量 BD_DATA_DIR，否则当前目录）
--config &lt;path&gt;    配置文件（默认：先找数据目录，再找引擎根目录）
--root-dir &lt;dir&gt;   引擎根目录：assets/、favicon-cache/、config.example.*
                   （默认：环境变量 BD_ROOT_DIR，否则自动探测）
--json             机器可读输出：stdout 只输出一个 JSON 文档
--help             显示帮助</pre>
<h3 style="margin:16px 0 6px">命令一览</h3>
<ul class="tips">
<li><b>scan [--edition morning|evening]</b> — 跑一期的抓取层，把候选写到 <span style="font-family:var(--mono)">state/candidates-日期-期次.json</span> 并逐源打印状态。不写 --edition 时按本地时间选期次（中午之前算 morning）。不带任何命令直接跑，等于 scan。</li>
<li><b>review</b> — 列出到了 14 天复核期的话题。</li>
<li><b>record &lt;file|-&gt; [--date YYYY-MM-DD]</b> — 把 agent 分好级的话题写回台账。输入是一个 JSON 数组，每条形如 <span style="font-family:var(--mono)">{"name":"话题名","sources":["Hacker News","Reddit"],"grade":"must"}</span>，grade 取 must / watch / echo。用 - 从 stdin 读。台账写入是原子的。</li>
<li><b>record review --name &lt;话题&gt; --result hit|miss</b> — 给一个话题登记 14 天复核结果。</li>
<li><b>publish [--out &lt;dir&gt;] [--base-url &lt;url&gt;] [--data-repo &lt;owner/repo&gt;] [--langs zh,en,ja] [--creator|--no-creator]</b> — 从数据目录生成静态站点。命令行参数覆盖 TS_* 环境变量，环境变量覆盖默认值（见下）。</li>
<li><b>docs [--out &lt;dir&gt;] [--docs-url &lt;url&gt;] [--main-url &lt;url&gt;] [--langs zh,en,ja]</b> — 构建独立的文档站（就是本站），只需要引擎根目录，不读数据目录。--docs-url 决定文档站自己的地址（默认 https://docs.breakerdelta.com/），--main-url 是文档里「雷达主页」回链指向的主站地址（默认 https://breakerdelta.com/）；环境变量 TS_DOCS_URL / TS_MAIN_URL / TS_DOCS_OUT 同义。</li>
<li><b>preset list</b> — 列出引擎内置的行业 preset（分类数、订阅源数、是否有简报），并标出当前实例选中的那个。</li>
<li><b>preset init &lt;名&gt;</b> — 把某个内置 preset 的 config 与 brief.md 复制进数据目录，成为你自己的可改副本；数据目录已有 config 时拒绝覆盖。</li>
<li><b>doctor [--online]</b> — 离线自检 Node、配置、数据目录与引擎根目录，含分类完整性检查（写了 categories 却解析不出有效规则会判 fail，免得 publish 时静默回退到内置分类）；加 --online 再抽查 config 里声明的订阅源地址是否可达（死源只 warn 不 fail）。有检查不通过时退出码为 1。</li>
<li><b>mcp</b> — 以 stdio 方式运行 MCP 服务器，提供 radar_scan 与 radar_review 两个工具（见 <a href="docs-skill.html">Skill 与 MCP</a>）。</li>
</ul>
<h3 style="margin:16px 0 6px">常用例子</h3>
<pre class="cfgpre full">BD="bun apps/cli/dist/breaker-delta.mjs"
$BD --data-dir /path/to/your-data doctor
$BD --data-dir /path/to/your-data scan --edition morning
echo '[{"name":"Some New Model","sources":["Hacker News","Reddit"],"grade":"must"}]' &gt; picks.json
$BD --data-dir /path/to/your-data record picks.json
$BD --data-dir /path/to/your-data record review --name "Some New Model" --result hit
$BD --data-dir /path/to/your-data publish --out site</pre>
<h3 style="margin:16px 0 6px">publish 的环境变量（数据仓 CI 用这一套）</h3>
<pre class="cfgpre full">TS_OUT           输出目录
TS_BASE_URL      站点根地址（决定 canonical、sitemap 与分享链接）
TS_DATA_REPO     投波等链接指向的数据仓 owner/repo
TS_LANGS         构建语言，逗号分隔，如 zh,en,ja
TS_CREATOR       1 开 / 0 关：话题页的「创作参考」面板
TS_PAGE_SIZE     海浪榜每页条数（默认 100）
TS_ARCHIVE_DAYS  归档保留天数
TS_SOURCES_PAGE  数据源页每页条数
TS_SHARE         分享平台列表，逗号分隔
TS_DOCS_URL      文档站地址：主站导航的「文档」标签指向它（默认 https://docs.breakerdelta.com/）
TS_MAIN_URL      主站地址：文档站的回链指向它（默认 https://breakerdelta.com/）</pre>
</div></section>`,
      en: `<section class="panel"><div class="panel-h"><span>CLI Reference</span></div>
<div class="detail">
<p>The CLI is one self-contained file, <span style="font-family:var(--mono)">breaker-delta.mjs</span> (see <a href="docs-getting-started.html">Getting Started</a> for bundling), called BD below. Exit codes: 0 success, 1 runtime error, 2 usage error.</p>
<h3 style="margin:16px 0 6px">Global options (may appear before or after the command)</h3>
<pre class="cfgpre full">--data-dir &lt;dir&gt;   Instance data dir: editions/, state/, track-record.md,
                   config.yaml|json (default: $BD_DATA_DIR or current dir)
--config &lt;path&gt;    Config file (default: search the data dir, then the engine root)
--root-dir &lt;dir&gt;   Engine root holding assets/, favicon-cache/ and config.example.*
                   (default: $BD_ROOT_DIR or auto-detected)
--json             Machine-readable output: stdout carries one JSON document
--help             Show help</pre>
<h3 style="margin:16px 0 6px">Commands</h3>
<ul class="tips">
<li><b>scan [--edition morning|evening]</b> — run the fetch layer for one edition, write <span style="font-family:var(--mono)">state/candidates-&lt;date&gt;-&lt;edition&gt;.json</span> and print per-source status. Without --edition, the edition is chosen by local hour (before noon = morning). No command at all = scan.</li>
<li><b>review</b> — list topics whose 14-day review is due.</li>
<li><b>record &lt;file|-&gt; [--date YYYY-MM-DD]</b> — write agent-graded topics back to the store. Input is a JSON array, each entry like <span style="font-family:var(--mono)">{"name":"Topic","sources":["Hacker News","Reddit"],"grade":"must"}</span>, with grade must / watch / echo. Use - to read stdin. The store write is atomic.</li>
<li><b>record review --name &lt;topic&gt; --result hit|miss</b> — record a 14-day review outcome for one topic.</li>
<li><b>publish [--out &lt;dir&gt;] [--base-url &lt;url&gt;] [--data-repo &lt;owner/repo&gt;] [--langs zh,en,ja] [--creator|--no-creator]</b> — build the static site from the data dir. Flags override the TS_* environment variables, which override defaults (below).</li>
<li><b>docs [--out &lt;dir&gt;] [--docs-url &lt;url&gt;] [--main-url &lt;url&gt;] [--langs zh,en,ja]</b> — build the standalone docs site (this site). Needs only the engine root; no data dir is read. --docs-url sets the docs site's own URL (default https://docs.breakerdelta.com/), --main-url the main radar site the docs link back to (default https://breakerdelta.com/); TS_DOCS_URL / TS_MAIN_URL / TS_DOCS_OUT do the same by environment.</li>
<li><b>preset list</b> — list the industry presets bundled with the engine (category count, feed count, brief), marking the one this instance selects.</li>
<li><b>preset init &lt;name&gt;</b> — copy a bundled preset's config and brief.md into the data dir as your own editable copy; refuses to overwrite an existing config.</li>
<li><b>doctor [--online]</b> — offline self-check of Node, config, data dir and engine root, including taxonomy integrity (a categories section that yields no valid rules fails, instead of silently falling back to the built-in taxonomy at publish time). --online additionally spot-checks a sample of the feed URLs the config declares (dead feeds warn, never fail). Exits 1 when any check fails.</li>
<li><b>mcp</b> — run the stdio MCP server with the tools radar_scan and radar_review (see <a href="docs-skill.html">Skill &amp; MCP</a>).</li>
</ul>
<h3 style="margin:16px 0 6px">Common examples</h3>
<pre class="cfgpre full">BD="bun apps/cli/dist/breaker-delta.mjs"
$BD --data-dir /path/to/your-data doctor
$BD --data-dir /path/to/your-data scan --edition morning
echo '[{"name":"Some New Model","sources":["Hacker News","Reddit"],"grade":"must"}]' &gt; picks.json
$BD --data-dir /path/to/your-data record picks.json
$BD --data-dir /path/to/your-data record review --name "Some New Model" --result hit
$BD --data-dir /path/to/your-data publish --out site</pre>
<h3 style="margin:16px 0 6px">publish environment variables (what a data repo's CI uses)</h3>
<pre class="cfgpre full">TS_OUT           Output directory
TS_BASE_URL      Site root URL (drives canonical, sitemap and share links)
TS_DATA_REPO     Data repo (owner/repo) that submit links point at
TS_LANGS         Languages to build, comma-separated, e.g. zh,en,ja
TS_CREATOR       1 on / 0 off: the creator panel on topic pages
TS_PAGE_SIZE     Board page size (default 100)
TS_ARCHIVE_DAYS  Archive retention in days
TS_SOURCES_PAGE  Sources per sources-page
TS_SHARE         Share platforms, comma-separated
TS_DOCS_URL      Docs site URL: the main site's Docs tab points here (default https://docs.breakerdelta.com/)
TS_MAIN_URL      Main site URL: the docs site links back here (default https://breakerdelta.com/)</pre>
</div></section>`,
    },
  },
  {
    file: "docs-config.html",
    title: { zh: "📖 配置", en: "📖 Configuration" },
    desc: {
      zh: "Breaker Delta 配置说明：config.yaml 的位置与加载顺序、关键词 mute/boost/alert、主题权重、信息源开关、词汇表与分级门槛。",
      en: "Breaker Delta configuration: where config.yaml lives and its load order, keyword mute/boost/alert, topic weights, source switches, the vocabulary and grading thresholds.",
    },
    body: {
      zh: `<section class="panel"><div class="panel-h"><span>配置</span></div>
<div class="detail">
<p>所有调参只发生在一个地方：数据目录里的 <span style="font-family:var(--mono)">config.yaml</span>（从引擎的 <span style="font-family:var(--mono)">config.example.yaml</span> 复制一份再改）。加载顺序是 config.yaml &gt; config.yml &gt; config.json &gt; 引擎侧示例文件；YAML 用内置子集解析器读，不需要装任何依赖，JSON 格式照常兼容。不要把门槛写死到别处——换行业、换口味都只改这个文件。</p>
<h3 style="margin:16px 0 6px">真正会动到的开关</h3>
<ul class="tips">
<li><b>keywords.mute（屏蔽词）</b>：候选的标题+摘要命中任意一个（子串、不分大小写）就直接丢弃。放你不想再看到的东西，比如 giveaway、airdrop。</li>
<li><b>keywords.boost（关注词）</b>：命中打标；分级时单源的回波可以因此升为关注。放你长期盯的词，比如某个产品名、mcp。</li>
<li><b>keywords.alert（必看词）</b>：命中且有第二源共振时，直接列为必看候选。只放极少数词，放多了必看就不值钱了。</li>
<li><b>topics（主题权重 1–5）</b>：相关性按这里打分，不再是沾边 / 不沾边的二选一。<b>换行业主要就是改这一节</b>（默认是 AI Agents 5、独立产品 4、开发者工具 4、内容创作 3、社会观察 2）。</li>
<li><b>sources.&lt;名字&gt;.enabled / max_items</b>：任何信息源都能单独关掉或限制条数。关掉的源在报告里记为「已停用」，不算缺失，agent 也不会去补扫。</li>
<li><b>filters.max_age_hours</b>：新鲜度窗口，只对带时间戳的候选生效；不填（null）就是不过滤。</li>
<li><b>vocab.window_days（新词词汇表，默认 60）</b>：实体型来源（GitHub / Hugging Face / OpenRouter / Civitai / Product Hunt / 目录站 / App Store）里，一个名字在窗口内没出现过，会被标成 novel——这是优先级最高的回波信号。第一次运行只建基线、不打标，这是正常现象。</li>
<li><b>grading</b>：min_sources_for_hotspot（默认 2，几个独立来源才算热点）、max_items_per_report（每期最多几条，默认 8）、max_echoes（回波最多几条，默认 3）。</li>
<li><b>review.after_days（默认 14）</b>：话题被报告后多少天复核战绩。</li>
<li><b>editions / timezone / language</b>：期次只是标签（名字、时间、每期侧重），扫描频率由你定，程序和文案里都不写死；时区默认 Asia/Tokyo。</li>
</ul>
<h3 style="margin:16px 0 6px">信息源怎么改</h3>
<p>26 个抓取组都在 config 的 sources 下面，每组有自己的参数（比如官方博客组的 feeds 列表、GitHub 的 min_stars_per_day）。给官方博客组加一个 feed、把某个源的 limit 调大、关掉不关心的源，都在这里改。每个源的完整目录与判定口径见仓库的 <a href="https://github.com/daiyanze/breaker-delta/blob/main/SOURCES.md" rel="noopener">SOURCES.md</a>；站点上的 <a href="sources.html">数据源页</a> 还会把每个源当前生效的配置原文展示出来，改完可以去那儿核对。</p>
<p class="note">注意：X（Twitter）是唯一需要 token 的源。不配 token 时它在报告里记为缺失、由 agent 用网页扫补齐，其余源全部免 key 可跑。</p>
</div></section>`,
      en: `<section class="panel"><div class="panel-h"><span>Configuration</span></div>
<div class="detail">
<p>All tuning happens in exactly one place: <span style="font-family:var(--mono)">config.yaml</span> in your data dir (copy the engine's <span style="font-family:var(--mono)">config.example.yaml</span> and edit). Load order is config.yaml &gt; config.yml &gt; config.json &gt; the engine's example file. YAML is read by a built-in subset parser — no dependencies to install — and JSON stays compatible. Never hardcode thresholds anywhere else: changing industry or taste means editing this file only.</p>
<h3 style="margin:16px 0 6px">The knobs people actually turn</h3>
<ul class="tips">
<li><b>keywords.mute</b>: a candidate whose title + summary contains any of these (substring, case-insensitive) is dropped outright. Put what you never want to see again here, e.g. giveaway, airdrop.</li>
<li><b>keywords.boost</b>: matches are flagged; when grading, a single-source echo with a boost hit can be promoted to Watch. Put terms you follow long-term here, e.g. a product name, mcp.</li>
<li><b>keywords.alert</b>: a match that also has a second source's resonance becomes a Must candidate directly. Keep this list very short, or Must stops meaning anything.</li>
<li><b>topics (weights 1–5)</b>: relevance is scored against these weights instead of a yes/no topical check. <b>Switching industries is mostly editing this section</b> (defaults: AI Agents 5, independent products 4, developer tools 4, content creation 3, social observation 2).</li>
<li><b>sources.&lt;name&gt;.enabled / max_items</b>: any source can be turned off or capped individually. A disabled source is reported as disabled, never as missing, and the agent will not try to fill it in.</li>
<li><b>filters.max_age_hours</b>: freshness window; only applies to candidates that carry a timestamp. Null means no filtering.</li>
<li><b>vocab.window_days (new-term vocabulary, default 60)</b>: on entity sources (GitHub / Hugging Face / OpenRouter / Civitai / Product Hunt / directories / App Store), a name unseen within the window is flagged novel — the highest-priority echo signal. The first run only builds the baseline and flags nothing; that is expected.</li>
<li><b>grading</b>: min_sources_for_hotspot (default 2 — independent sources needed for a hotspot), max_items_per_report (default 8), max_echoes (default 3).</li>
<li><b>review.after_days (default 14)</b>: when a reported topic comes due for its track-record review.</li>
<li><b>editions / timezone / language</b>: editions are just labels (name, time, per-edition focus). Scan frequency is yours to define — nothing about it is baked into the program or the copy. Default timezone is Asia/Tokyo.</li>
</ul>
<h3 style="margin:16px 0 6px">Changing sources</h3>
<p>All 26 fetcher groups live under sources in the config, each with its own parameters (the official-blogs feed list, GitHub's min_stars_per_day, and so on). Adding a feed, raising a limit, or switching a source off all happen here. The full catalog and each source's rules are in the repo's <a href="https://github.com/daiyanze/breaker-delta/blob/main/SOURCES.md" rel="noopener">SOURCES.md</a>; the site's <a href="sources.html">Sources page</a> also shows each source's effective config verbatim, so you can verify a change there.</p>
<p class="note">Note: X (Twitter) is the only source that needs a token. Without one it is reported as missing and the agent fills it in by scanning the web; every other source runs keyless.</p>
</div></section>`,
    },
  },
  {
    file: "docs-skill.html",
    title: { zh: "📖 Skill 与 MCP", en: "📖 Skill & MCP" },
    desc: {
      zh: "Breaker Delta 的 Skill 与 MCP 用法：运行 Skill（skills/breaker-delta）装进 agent 工具后 agent 会怎么做、配置向导 Skill（skills/breaker-delta-setup）如何对话配出一个新实例、扫描频率由谁定、MCP 的 radar_scan 与 radar_review。",
      en: "Breaker Delta as a Skill and as MCP: what the agent does once the run skill (skills/breaker-delta) is installed in a harness, how the setup wizard skill (skills/breaker-delta-setup) configures a new instance conversationally, who owns the schedule, and the MCP tools radar_scan and radar_review.",
    },
    body: {
      zh: `<section class="panel"><div class="panel-h"><span>Skill 与 MCP</span></div>
<div class="detail">
<p>抓取和算分是代码做的，但「把候选判成必看 / 关注 / 回波」需要判断力——这部分是交给 agent 的。Breaker Delta 把这套判断写成了一份固定指令（Skill），任何 agent 照着跑，结果的结构和标准都一样，不靠临场发挥。</p>
<h3 style="margin:16px 0 6px">当作 Skill 用</h3>
<ul class="tips">
<li>把引擎仓里的 <span style="font-family:var(--mono)">skills/breaker-delta/</span>（运行：每期扫描与出报告）装进你的 agent 工具（Claude Code、Codex 等都支持 Skill 目录），或者直接让 agent 读 SKILL.md 并照着执行。第一次配置一个新实例（选行业、定分类、配订阅源）用另一个 <span style="font-family:var(--mono)">skills/breaker-delta-setup/</span> 向导 Skill，和 agent 对话就能配好，不用手写配置。</li>
<li>agent 每一期的固定动作：先读台账 → 跑 CLI 的 scan 拿候选底稿 → 按方法论的门槛分级（共振数、增速、新鲜度、与你 config 里主题权重的相关性）→ 对台账去重（老话题只报状态变化）→ 用 record 写回台账 → 按固定模板出报告。</li>
<li>缺失的源（通常只有 X 和当期失败的源）由 agent 用网页扫补齐并在报告里如实标注；你在 config 里关掉的源不算缺失，不补扫。</li>
<li><b>扫描频率完全由你定</b>：可以用 agent 的定时任务、GitHub Actions 或手动触发。雷达本身不规定一天几次，产品文案里也不写死频率。</li>
</ul>
<h3 style="margin:16px 0 6px">当作 MCP 服务器用</h3>
<p>同一个单文件程序也是一个 stdio MCP 服务器。在你的 agent 工具里把下面这条命令登记为 MCP 服务器即可（数据目录换成你自己的）：</p>
<pre class="cfgpre full">bun apps/cli/dist/breaker-delta.mjs --data-dir /path/to/your-data mcp</pre>
<ul class="tips">
<li><b>radar_scan</b>：跑一期抓取层，返回候选与逐源状态。</li>
<li><b>radar_review</b>：返回到期需要复核的话题清单。</li>
<li>分级、写回和出报告仍按 Skill 的流程走；MCP 只是把这两个最常用的动作变成 agent 可以直接调用的工具。</li>
</ul>
<h3 style="margin:16px 0 6px">边界</h3>
<ul class="tips">
<li>只读公开信息：不发帖、不点赞、不互动。</li>
<li>不编造数字和链接；查不到的源在报告里写「缺失」，不用别的内容冒充。</li>
<li>密钥只走环境变量，永远不写进仓库。</li>
</ul>
</div></section>`,
      en: `<section class="panel"><div class="panel-h"><span>Skill &amp; MCP</span></div>
<div class="detail">
<p>Fetching and scoring are code, but grading candidates into Must / Watch / Echo takes judgment — and that part is delegated to an agent. Breaker Delta writes that judgment down as fixed instructions (a Skill), so any agent running it produces the same structure and standards instead of improvising.</p>
<h3 style="margin:16px 0 6px">Use it as a Skill</h3>
<ul class="tips">
<li>Install <span style="font-family:var(--mono)">skills/breaker-delta/</span> (the run skill: scanning and reporting each edition) from the engine repo into your agent harness (Claude Code, Codex and others support Skill folders), or simply have the agent read SKILL.md and follow it. To configure a new instance (pick an industry, define categories, set up sources), use the companion <span style="font-family:var(--mono)">skills/breaker-delta-setup/</span> wizard skill — it interviews you in chat, no hand-written config needed.</li>
<li>The agent's fixed routine per edition: read the ledger first → run the CLI's scan for the candidate file → grade against the methodology's thresholds (resonance, growth, freshness, relevance to your config's topic weights) → dedupe against the ledger (old topics only report state changes) → write back with record → report in the fixed format.</li>
<li>Missing sources (usually only X, plus anything that failed that edition) are filled in by the agent scanning the web and are labeled as such in the report; sources you disabled in config are not missing and are not filled in.</li>
<li><b>Scheduling is entirely yours</b>: your agent's cron, GitHub Actions, or manual runs. The radar prescribes no frequency, and no fixed schedule appears in its copy.</li>
</ul>
<h3 style="margin:16px 0 6px">Use it as an MCP server</h3>
<p>The same single-file bundle is also a stdio MCP server. Register this command in your agent harness (with your own data dir):</p>
<pre class="cfgpre full">bun apps/cli/dist/breaker-delta.mjs --data-dir /path/to/your-data mcp</pre>
<ul class="tips">
<li><b>radar_scan</b>: run one edition's fetch layer and return candidates with per-source status.</li>
<li><b>radar_review</b>: return the topics due for their 14-day review.</li>
<li>Grading, write-back and reporting still follow the Skill flow; MCP simply exposes the two most-used actions as tools the agent can call directly.</li>
</ul>
<h3 style="margin:16px 0 6px">Boundaries</h3>
<ul class="tips">
<li>Read-only access to public information: no posting, no liking, no interacting.</li>
<li>No invented numbers or links; a source that cannot be checked is reported as missing, never substituted.</li>
<li>Secrets travel via environment variables only, never into the repo.</li>
</ul>
</div></section>`,
    },
  },
  {
    file: "docs-extension.html",
    title: { zh: "📖 Chrome 扩展", en: "📖 Chrome Extension" },
    desc: {
      zh: "Breaker Delta Chrome 扩展用法：侧载安装、一键收波、浪高徽章与破圈角标、一键投波、设置页、权限与隐私、故障排查。",
      en: "Breaker Delta Chrome extension guide: sideload install, one-click echo capture, wave-height badges and alert counts, one-click submit, settings, permissions, privacy and troubleshooting.",
    },
    body: {
      zh: `<section class="panel"><div class="panel-h"><span>Chrome 扩展：收波器</span></div>
<div class="detail">
<p>扩展是雷达的随身版：刷网页时看到可能要火的东西，一键先收下来；打开已经被雷达收录的页面，它直接告诉你浪高多少。扩展的完整独立文档在引擎仓的 <span style="font-family:var(--mono)">apps/extension/README.md</span>（含中文版），这一页是站点内的速查版。</p>
<h3 style="margin:16px 0 6px">它能做什么</h3>
<ul class="tips">
<li><b>🌀 一键收波</b>：任意页面点工具栏图标，把标题、链接、你选中的文字和一句理由存进本地回波箱。</li>
<li><b>✓ 收录状态</b>：弹窗顶部直接显示当前页有没有被雷达收录；已收录的显示话题名、浪高、首现日期和话题页链接。</li>
<li><b>🌊 浪高徽章</b>：在 GitHub / Hacker News / Reddit / X / Product Hunt 五个站，打开命中已收录话题的页面，右下角会浮出浪高卡片，正在破圈的话题带 ⚡。</li>
<li><b>⚡ 破圈角标</b>：工具栏图标上的橙色数字 = 当前正在破圈的话题数；没有破圈时不显示数字，这是正常的。</li>
<li><b>🚀 一键投波</b>：点回波旁的「🌀 投波」，会在目标数据仓打开一个新 Issue 页，标题、正文、标签都已填好，你只需在 GitHub 上点提交。不需要 token，扩展也不会替你提交。</li>
<li><b>📤 导出</b>：整个回波箱可以复制成 Issue 文本，或下载成 JSON 存档。</li>
</ul>
<h3 style="margin:16px 0 6px">安装（侧载，开发者模式）</h3>
<ol class="ol-list">
<li>准备扩展文件夹：最快是用现成的侧载副本；或者在引擎仓根目录跑 <span style="font-family:var(--mono)">bun run --filter @breaker-delta/extension build</span> 自己构建，产物在 <span style="font-family:var(--mono)">apps/extension/dist/</span>。</li>
<li>打开 <span style="font-family:var(--mono)">chrome://extensions/</span>，打开右上角「开发者模式」。</li>
<li>点「加载已解压的扩展程序」，选中扩展文件夹。</li>
<li>把扩展固定到工具栏，收波能少点一次。</li>
</ol>
<p class="note">改了代码或数据后，要在 chrome://extensions/ 里点扩展卡片上的刷新（↻）才会生效，只关弹窗不会更新。</p>
<h3 style="margin:16px 0 6px">设置页</h3>
<p>从弹窗底部的「⚙ 设置」或扩展的「选项」打开：<b>数据仓</b>（投波投到哪个 owner/repo，默认 daiyanze/breaker-delta-data，也可粘贴完整的 github.com 地址）、<b>实例站点地址</b>（话题链接指向哪、话题与提醒数据从哪拉；跑自己实例的改成自己的地址）、<b>收波后立即打开投波页</b>、<b>投波后是否保留本地副本</b>。设置只存在浏览器本地。</p>
<h3 style="margin:16px 0 6px">数据从哪来</h3>
<p>话题与破圈数据（topics.json / alerts.json）由站点构建时生成、随站点发布。扩展会从设置里的实例站点<b>实时拉取</b>（安装时、浏览器启动时、打开弹窗时各拉一次，设置页可手动强制刷新）并缓存在本地；拉不到时用安装包里自带的快照兜底。全程只有下载，没有后端、没有账号。</p>
<h3 style="margin:16px 0 6px">权限与隐私（为什么只有三个权限）</h3>
<ul class="tips">
<li><b>activeTab</b>：只在你点图标时临时读当前页的标题、链接和选中文字，平时碰不到你的页面。</li>
<li><b>scripting</b>：配合 activeTab 读取选中文字。</li>
<li><b>storage</b>：回波箱只存在你的浏览器本地。</li>
<li>不申请 tabs / history / cookies / 全站权限；从不记录浏览历史；徽章的匹配在本地完成，结果不离开浏览器；没有遥测、没有第三方代码。</li>
<li>投波后回波被标成「投波页已打开」——扩展看不到你是否真的在 GitHub 上点了提交，这个标记只表示页面打开过。很长的摘录会被截断，保证预填链接不超 GitHub 的长度上限。</li>
</ul>
<h3 style="margin:16px 0 6px">常见问题</h3>
<ul class="tips">
<li><b>没有浪高徽章</b>：依次查——页面是不是在五个支持站内？话题是不是真的已被收录？数据是不是太旧（去设置页强制刷新）？最后刷新页面。</li>
<li><b>图标没有角标数字</b>：当前没有破圈话题时就是没有数字，正常。</li>
<li><b>提示当前页读不了</b>：chrome:// 内部页、应用商店等受保护页面读不了，这是 Chrome 的限制，换普通网页即可。</li>
<li><b>选中文字没存上</b>：先选中文字再打开弹窗；弹窗里显示「已选中 N 字」才表示会存。</li>
<li><b>点设置没反应</b>：先在 chrome://extensions/ 点刷新确认版本 ≥ 0.6.1（该版本给设置入口加了兜底：官方接口失败时直接用新标签页打开设置页）。</li>
</ul>
</div></section>`,
      en: `<section class="panel"><div class="panel-h"><span>Chrome Extension: Echo Catcher</span></div>
<div class="detail">
<p>The extension is the radar in your pocket: spot something that might take off while browsing and capture it in one click; open a page the radar already tracks and it tells you the wave height on the spot. Its full standalone guide lives in the engine repo at <span style="font-family:var(--mono)">apps/extension/README.md</span>; this page is the in-site quick reference.</p>
<h3 style="margin:16px 0 6px">What it does</h3>
<ul class="tips">
<li><b>🌀 One-click echo capture</b>: on any page, click the toolbar icon to save the title, URL, your selected text and a one-line note into a local echo inbox.</li>
<li><b>✓ Tracked status</b>: the top of the popup shows whether the current page is already tracked; if it is, you see the topic, its heat, its first-seen date and a link to its topic page.</li>
<li><b>🌊 Heat badge</b>: on GitHub / Hacker News / Reddit / X / Product Hunt, a page matching a tracked topic gets a badge card in the bottom-right corner (topic, heat, first-seen date, topic link); breaking topics carry a ⚡.</li>
<li><b>⚡ Alert count</b>: the orange number on the toolbar icon is how many topics are currently breaking out. No number means no breaking topics — that is normal.</li>
<li><b>🚀 One-click submit</b>: the 投波 button on an echo opens a new-issue page in the target data repo with title, body and label already filled in — you only click Submit on GitHub. No token needed, and the extension never submits for you.</li>
<li><b>📤 Export</b>: copy the whole inbox as GitHub Issue text, or download it as JSON.</li>
</ul>
<h3 style="margin:16px 0 6px">Install (unpacked, developer mode)</h3>
<ol class="ol-list">
<li>Get the extension folder: fastest is a ready-made sideload copy; or build it yourself from the engine repo root with <span style="font-family:var(--mono)">bun run --filter @breaker-delta/extension build</span> — output lands in <span style="font-family:var(--mono)">apps/extension/dist/</span>.</li>
<li>Open <span style="font-family:var(--mono)">chrome://extensions/</span> and turn on Developer mode (top right).</li>
<li>Click "Load unpacked" and select the extension folder.</li>
<li>Pin the extension to the toolbar so capturing takes one click less.</li>
</ol>
<p class="note">After changing code or data, click the reload (↻) button on the extension's card at chrome://extensions/ — closing the popup does not update anything.</p>
<h3 style="margin:16px 0 6px">Settings</h3>
<p>Open via ⚙ in the popup footer or the extension's Options page: <b>data repo</b> (owner/repo receiving submissions, default daiyanze/breaker-delta-data; a full github.com URL also works), <b>instance site URL</b> (where topic links point and where topics/alerts data is fetched from — point it at your own instance if you run one), <b>open the submit page right after capturing</b>, and <b>keep the local copy after submitting</b>. Settings live in chrome.storage.local only.</p>
<h3 style="margin:16px 0 6px">Where the data comes from</h3>
<p>Topic and alert data (topics.json / alerts.json) is generated by the site build and published with the site. The extension <b>fetches it live</b> from the configured instance site (on install, on browser startup, and when the popup opens; the Settings page can force a refresh) and caches it locally; the bundled snapshot is only a fallback when the site cannot be reached. Downloads only — no backend, no accounts.</p>
<h3 style="margin:16px 0 6px">Permissions and privacy (why only three)</h3>
<ul class="tips">
<li><b>activeTab</b>: temporary access to the current tab only when you click the icon — title, URL and selected text. It cannot touch your pages at any other time.</li>
<li><b>scripting</b>: together with activeTab, reads the selected text when you capture.</li>
<li><b>storage</b>: the echo inbox lives in your browser only.</li>
<li>No tabs / history / cookies / all-URLs permission; browsing history is never recorded; badge matching happens locally and never leaves the browser; no telemetry, no third-party code.</li>
<li>After submitting, an echo is marked "submit page opened" — the extension cannot see whether you actually clicked Submit on GitHub. Very long excerpts are truncated so prefilled URLs stay within GitHub's length limit.</li>
</ul>
<h3 style="margin:16px 0 6px">Troubleshooting</h3>
<ul class="tips">
<li><b>No heat badge</b>: check in order — is the page on one of the five supported sites? Is the topic actually tracked? Is the data stale (force a refresh in Settings)? Then reload the page.</li>
<li><b>No badge number on the icon</b>: normal when nothing is breaking out.</li>
<li><b>"Current page cannot be read"</b>: protected pages (chrome:// internals, the Web Store) cannot be read — a Chrome restriction. Try a normal web page.</li>
<li><b>Selected text not saved</b>: select the text first, then open the popup; the popup shows "N characters selected" when an excerpt will be saved.</li>
<li><b>Settings does not open</b>: reload the extension at chrome://extensions/ and confirm version ≥ 0.6.1 — that version added a fallback that opens the settings page in a new tab when the official API silently fails.</li>
</ul>
</div></section>`,
    },
  },
  {
    file: "docs-deploy.html",
    title: { zh: "📖 自建与部署", en: "📖 Deploy Your Own" },
    desc: {
      zh: "Breaker Delta 自建实例：引擎仓与数据仓的分工、数据仓的形状、GitHub Pages 自动构建流程、TS_* 覆盖项与常见部署故障。",
      en: "Run your own Breaker Delta instance: the engine-repo / data-repo split, the data repo's shape, the GitHub Pages build flow, TS_* overrides and common deployment failures.",
    },
    body: {
      zh: `<section class="panel"><div class="panel-h"><span>自建与部署</span></div>
<div class="detail">
<h3 style="margin:6px 0 6px">先记住一条原则：数据归你</h3>
<p>引擎仓（daiyanze/breaker-delta）只放代码，永远不放任何实例采集到的数据。你的每一期、台账、战绩和配置都放在<b>你自己的数据仓</b>里，由数据仓的 CI 拉取引擎来构建、部署到数据仓自己的 GitHub Pages。这样换引擎版本不会动你的数据，公开你的站点也不等于公开你的仓库结构之外任何东西。</p>
<h3 style="margin:16px 0 6px">数据仓长什么样</h3>
<pre class="cfgpre full">your-data-repo/
  editions/            # 每一期
  state/               # 台账、词汇表、sitemap 基线
  track-record.md      # 战绩台账
  config.yaml          # 你的配置（可选；没有就用引擎示例）
  .github/workflows/pages.yml   # 构建并部署到本仓 Pages</pre>
<p>现成的参照是 <a href="https://github.com/daiyanze/breaker-delta-data" rel="noopener">daiyanze/breaker-delta-data</a>：照它的形状建仓、把数据换成自己的，雷达就是你的了。</p>
<h3 style="margin:16px 0 6px">GitHub Pages 自动构建怎么跑</h3>
<ol class="ol-list">
<li>在数据仓的 Settings 里把 Pages 的来源设为 GitHub Actions。</li>
<li>数据仓的 workflow 做四件事：检出数据仓 → 检出引擎仓 → <span style="font-family:var(--mono)">bun install &amp;&amp; bun run bundle</span> 打包 CLI → 用你的数据目录跑 publish 并部署。</li>
<li>构建时用两个环境变量把站点指向你自己：<span style="font-family:var(--mono)">TS_BASE_URL</span>（你的 Pages 地址）和 <span style="font-family:var(--mono)">TS_DATA_REPO</span>（你的数据仓）。其余 TS_* 见 <a href="docs-cli.html">CLI 参考</a>。</li>
<li>之后每次往数据仓推数据（比如扫描流程推入新一期），CI 自动重建，站点自动更新，不需要手动部署。</li>
</ol>
<p>官方实例现在跑在 Cloudflare Pages 上（项目直连仓库、推送自动构建）：主站项目连数据仓、构建时 clone 引擎仓，文档项目连引擎仓直接构建，两个项目各绑各的域名（breakerdelta.com 与 docs.breakerdelta.com）。构建命令与上面 GitHub Actions 版完全一致，只是执行方从 GitHub 换成 Cloudflare；自建实例两个平台任选其一即可。</p>
<h3 style="margin:16px 0 6px">域名布局：主体、文档、应用各住各的</h3>
<p>官方站点的域名分工是固定的：<b>主站住根域名</b>（breakerdelta.com —— 榜单和话题页是公开内容，吃分享与搜索，根域名最干净）；<b>文档是独立站</b>（docs.breakerdelta.com —— 就是本站，由单独的 docs 仓用 <span style="font-family:var(--mono)">docs</span> 命令构建部署，不和主站挤同一个构建，主站导航里的「文档」只是链过来）；<b>app. 子域名预留</b>给将来需要登录的产品，现在不用。自建实例想用自己的域名同理：把 TS_BASE_URL 换成你的根地址即可，文档站可以链到官方 docs，也可以跑 docs 命令自建一份。</p>
<h3 style="margin:16px 0 6px">一个真实踩过的坑</h3>
<p>数据仓 CI 用的是它自己的默认令牌，<b>读不了私有仓</b>。如果引擎仓被设成私有，数据仓的构建会在「检出引擎仓」这一步直接失败（repository not found），站点随之停更——包括扫描推数据后触发的自动重建。两个解法：把引擎仓保持公开（最简单），或在数据仓的 Secrets 里放一个能读引擎仓的只读令牌并在 workflow 里用它检出。</p>
<h3 style="margin:16px 0 6px">更新与日常</h3>
<ul class="tips">
<li><b>更新引擎</b>：数据仓 CI 每次都拉引擎的 main 构建，所以引擎发新版后，你的站点下一次重建就自动用上新版；想锁定版本就把 workflow 里的 ref 改成某个 tag。</li>
<li><b>改配置</b>：只改数据仓里的 config.yaml 并推送，CI 重建后生效；改完去站点的数据源页核对每个源的生效配置。</li>
<li><b>本地先验</b>：推送前先在本地用同一条 publish 命令构建一遍（见 <a href="docs-getting-started.html">快速开始</a>），本地能过，CI 基本就能过。</li>
<li><b>构建失败先看哪一步</b>：检出引擎失败多半是可见性 / 令牌问题；打包失败看 Bun 版本（要 ≥ 1.2）；publish 失败先对数据目录跑 doctor。</li>
</ul>
</div></section>`,
      en: `<section class="panel"><div class="panel-h"><span>Deploy Your Own</span></div>
<div class="detail">
<h3 style="margin:6px 0 6px">One principle first: you own your data</h3>
<p>The engine repo (daiyanze/breaker-delta) holds code only — never any instance's collected data. Your editions, ledger, track record and config live in <b>your own data repo</b>; its CI checks out the engine, builds the site from your data, and deploys to the data repo's own GitHub Pages. Upgrading the engine never touches your data.</p>
<h3 style="margin:16px 0 6px">The data repo's shape</h3>
<pre class="cfgpre full">your-data-repo/
  editions/            # one file per edition
  state/               # ledger, vocabulary, sitemap baselines
  track-record.md      # the pick ledger
  config.yaml          # your config (optional; the engine example is the fallback)
  .github/workflows/pages.yml   # build and deploy to this repo's Pages</pre>
<p>The working reference is <a href="https://github.com/daiyanze/breaker-delta-data" rel="noopener">daiyanze/breaker-delta-data</a>: clone its shape, point it at your own data, and the radar is yours.</p>
<h3 style="margin:16px 0 6px">How the GitHub Pages build flows</h3>
<ol class="ol-list">
<li>In the data repo's Settings, set the Pages source to GitHub Actions.</li>
<li>The data repo's workflow does four things: check out the data repo → check out the engine repo → <span style="font-family:var(--mono)">bun install &amp;&amp; bun run bundle</span> → run publish against your data dir and deploy.</li>
<li>Two environment variables point the build at you: <span style="font-family:var(--mono)">TS_BASE_URL</span> (your Pages URL) and <span style="font-family:var(--mono)">TS_DATA_REPO</span> (your data repo). The rest of TS_* is in the <a href="docs-cli.html">CLI Reference</a>.</li>
<li>From then on, every push of new data (for example a scan pushing a new edition) triggers a rebuild — the site updates itself, no manual deploys.</li>
</ol>
<p>The official instance now runs on Cloudflare Pages (projects connected straight to the repos, built on every push): the main project connects to the data repo and clones the engine during its build, the docs project connects to the engine repo and builds directly, each with its own domain (breakerdelta.com and docs.breakerdelta.com). The build commands are exactly the ones above — only the runner changed from GitHub to Cloudflare; self-hosters can pick either platform.</p>
<h3 style="margin:16px 0 6px">Domain layout: main site, docs and app live apart</h3>
<p>The official domains are split on purpose: the <b>main site sits at the apex</b> (breakerdelta.com — the boards and topic pages are public content that lives on sharing and search, and the apex is the cleanest address for both); the <b>docs are a separate site</b> (docs.breakerdelta.com — this site, built and deployed by its own docs repo running the <span style="font-family:var(--mono)">docs</span> command, never bundled into the main build; the main site's Docs tab simply links here); and the <b>app. subdomain is reserved</b> for a future logged-in product. For your own instance the same shape applies: point TS_BASE_URL at your apex, and either link to the official docs or build your own copy with the docs command.</p>
<h3 style="margin:16px 0 6px">A real failure worth knowing</h3>
<p>A data repo's CI uses its own default token, which <b>cannot read a private repo</b>. If the engine repo is made private, the data repo's build fails at the "check out engine repo" step (repository not found) and the site stops updating — including the rebuilds triggered by scan data pushes. Two fixes: keep the engine repo public (simplest), or store a read-only token for the engine repo in the data repo's Secrets and use it for that checkout.</p>
<h3 style="margin:16px 0 6px">Updates and day-to-day</h3>
<ul class="tips">
<li><b>Engine updates</b>: the data repo's CI builds from the engine's main every time, so a new engine release reaches your site at its next rebuild. Pin the workflow's ref to a tag if you prefer locked versions.</li>
<li><b>Config changes</b>: edit config.yaml in the data repo and push; after the rebuild, verify each source's effective config on the site's Sources page.</li>
<li><b>Verify locally first</b>: run the same publish command locally before pushing (see <a href="docs-getting-started.html">Getting Started</a>) — if it builds locally, CI almost always builds too.</li>
<li><b>Where a failed build usually breaks</b>: engine checkout = visibility / token; bundling = Bun version (needs ≥ 1.2); publish = run doctor against the data dir first.</li>
</ul>
</div></section>`,
    },
  },
];
