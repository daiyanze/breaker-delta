// Publisher assets and data tables — hand-maintained. (Until
// Rewrite Phase 3b this file also carried the UI string tables,
// generated from the retired Python publisher; the strings now
// live in @breaker-delta/i18n. What remains here is the static
// renderer's stylesheet, share/platform tables and source-matching
// data — assets of the rendering layer, not copy.)

export const CSS: string = "\n:root{--bg:#0a0e13;--panel:#0d1319;--line:#26303d;--ink:#e8eef5;--sub:#93a5bb;--faint:#5f7189;\n --teal:#5eead4;--green:#4ade80;--red:#fb7185;--amber:#f5b83d;--mono:ui-monospace,\"SF Mono\",Menlo,Consolas,monospace}\n*{box-sizing:border-box}\nbody{margin:0;background:var(--bg);color:var(--ink);line-height:1.6;\n font-family:\"Avenir Next\",\"Segoe UI\",system-ui,\"PingFang SC\",\"Microsoft YaHei\",sans-serif}\n.wrap{max-width:1060px;margin:0 auto;padding:26px 18px 50px}\na{color:var(--teal);text-decoration:none} a:hover{text-decoration:underline}\nheader.mast{display:flex;align-items:center;gap:12px;border:1px solid var(--line);\n background:var(--panel);padding:12px 16px;border-radius:8px}\nheader.mast svg{width:30px;height:30px}header.mast img.mastmark{width:30px;height:30px}\n.wordmark{font-size:13px;letter-spacing:.32em;font-weight:700}\n.pg-title{font-size:21px;font-weight:800}\nnav.tabs{display:flex;gap:8px;margin:14px 0 0}\nnav.tabs a{border:1px solid var(--line);border-radius:6px;padding:5px 14px;color:var(--sub);font-size:13.5px}\nnav.tabs a.on{color:var(--ink);border-color:var(--teal);background:rgba(94,234,212,.07)}\n.timeline{display:flex;align-items:flex-start;margin:30px 2px 14px;position:relative}\n.timeline::before{content:\"\";position:absolute;left:0;right:0;top:5px;border-top:1px solid var(--line)}\n.tick{flex:1;text-align:center;position:relative}\n.tick a{color:var(--faint);font-size:12px;display:block;padding-top:20px}\n.tick::before{content:\"\";position:absolute;top:0;left:50%;margin-left:-5px;width:9px;height:9px;\n border-radius:50%;border:1px solid var(--faint);background:var(--bg)}\n.tick.on a{color:var(--beam,#f5d97e);font-weight:700}\n.tick.on::before{background:#f5d97e;border-color:#f5d97e}\n.tl-label{color:var(--faint);font-size:12px;margin-top:14px}\n.panel{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:6px 16px 14px;margin-top:18px}\n.panel-h{display:flex;justify-content:space-between;padding:10px 0 6px;font-weight:700;font-size:15px}\n.panel-h .r{color:var(--faint);font-weight:400;font-size:12.5px}\n.row{display:flex;align-items:center;gap:13px;padding:11px 0;border-top:1px solid rgba(255,255,255,.05)}\n.row:first-of-type{border-top:none}\n.rank{font-size:17px;font-weight:800;width:24px;text-align:center;color:#7d8ea6;font-family:var(--mono)}\n.rank.top{color:var(--amber)}\n.rtitle{flex:1;min-width:0;font-size:15px;font-weight:600}\n.rtitle a{color:var(--ink)} .rtitle a:hover{color:var(--teal);text-decoration:none}\n.avatars{display:flex;align-items:center;flex:none}\n.av{width:24px;height:24px;border-radius:50%;margin-left:-7px;border:2px solid var(--panel);\n display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;color:#0b1017}\n.av:first-child{margin-left:0}\n.avimg{width:24px;height:24px;border-radius:50%;margin-left:-7px;border:2px solid var(--panel);\n background:#fff;object-fit:cover;flex:none}\n.src-ic{width:30px;height:30px;margin-left:0}\n.spark{flex:none;color:#38bdf8;display:flex;align-items:center}\n.prank{display:inline;font-size:10.5px;color:var(--faint);font-weight:400;font-family:var(--mono)}\n.rank{display:flex;align-items:baseline;gap:6px;width:auto;min-width:70px;text-align:left}\n.hdelta{font-size:11.5px;font-family:var(--mono);color:var(--faint)}\n.hdelta.up{color:var(--green)} .hdelta.down{color:var(--red)} .hdelta.new{color:var(--amber)}\n.heat{display:flex;align-items:center;gap:10px}\n.heat .hv{text-align:right}\n.mast-ctl{display:flex;gap:8px;margin-left:auto;align-items:center}\n.theme-btn{border:1px solid var(--line);background:none;color:var(--sub);border-radius:6px;\n padding:4px 10px;cursor:pointer;font-size:13px}\n.theme-btn:hover{color:var(--teal);border-color:var(--teal)}\n.langs{display:flex;gap:6px}\n.langs a{border:1px solid var(--line);border-radius:6px;padding:4px 9px;font-size:12px;color:var(--sub)}\n.langs a.on{color:var(--ink);border-color:var(--teal)}\n.ticks-scroll{overflow-x:auto;scrollbar-width:thin;padding-bottom:10px}\n.timeline.tight{flex-wrap:nowrap}\n.timeline.tight .tick{flex:none;min-width:118px}\n.tick.dim a{visibility:hidden}\n.srctops{font-size:12px;color:var(--sub)}\n[data-theme=\"light\"]{--bg:#f4f1ea;--panel:#fffdf7;--line:#d8d1bd;--ink:#1b2430;--sub:#5d6b7a;\n --faint:#8b96a5;--teal:#0d9488}\n[data-theme=\"light\"] .row{border-top-color:rgba(0,0,0,.07)}\n[data-theme=\"light\"] th,[data-theme=\"light\"] td{border-top-color:rgba(0,0,0,.08)}\n[data-theme=\"light\"] .detail{color:#3d4756}\n[data-theme=\"light\"] .spark{color:#0284c7}\n[data-theme=\"light\"] .badge{background:rgba(0,0,0,.04)}\n[data-theme=\"light\"] details{border-top-color:rgba(0,0,0,.14)}\n.avimg:first-child{margin-left:0}\n.time{flex:none;color:var(--faint);font-size:12px;font-family:var(--mono)}\n.tag{flex:none;font-size:11px;color:var(--teal);border:1px solid rgba(94,234,212,.35);\n border-radius:4px;padding:0 6px}\n.more-n{margin-left:6px;font-size:11.5px;color:var(--sub);border:1px solid var(--line);border-radius:999px;padding:1px 7px}\n.heat{flex:none;text-align:right;font-family:var(--mono)}\n.heat b{font-size:16.5px}\n.heat span{color:var(--faint);font-size:11.5px}\n.deltas{flex:none;display:flex;flex-direction:column;gap:2px;min-width:86px}\n.dchip{font-size:11.5px;font-family:var(--mono);border:1px solid var(--line);border-radius:4px;padding:0 6px;color:var(--sub)}\n.dchip.up{color:var(--green);border-color:rgba(74,222,128,.4)}\n.dchip.down{color:var(--red);border-color:rgba(251,113,133,.4)}\n.dchip.new{color:var(--amber);border-color:rgba(245,184,61,.45)}\ntable{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:12px;line-height:1.55}\nth,td{border-top:1px solid rgba(255,255,255,.06);padding:11px 12px;text-align:left;vertical-align:top}\nth{color:var(--faint);font-weight:600;font-size:12px}\ntd.n,th.n{font-family:var(--mono)}\n.badge{display:inline-block;font-size:11.5px;font-weight:700;padding:1.5px 9px;border:1px solid var(--line);\n border-radius:999px;background:rgba(255,255,255,.04)}\n.big-heat{font-family:var(--mono);font-size:52px;font-weight:800;line-height:1}\n.detail{color:#c3cedd;font-size:14.5px}\n.detail p{margin:7px 0}\ndetails{margin-top:10px;border-top:1px dashed rgba(255,255,255,.12);padding-top:9px}\nsummary{cursor:pointer;color:var(--teal);font-size:13px;font-weight:600;list-style:none}\nsummary::-webkit-details-marker{display:none}\ndetails ul{margin:7px 0 2px;padding-left:18px}\ndetails li{font-size:12.5px;margin:3px 0;word-break:break-all}\ndetails a{color:var(--sub)}\n.pager{display:flex;gap:8px;justify-content:center;margin-top:16px}\n.pager a,.pager span{border:1px solid var(--line);border-radius:6px;padding:4px 13px;font-size:13px;color:var(--sub)}\n.pager span.on{color:var(--ink);border-color:var(--teal)}\nfooter{margin-top:26px;color:var(--faint);font-size:12.5px;border-top:1px solid var(--line);padding-top:13px}\n@media (max-width: 720px){\n  .wrap{padding:0 10px 40px}\n  .mast{flex-wrap:wrap;gap:8px}\n  .brand{font-size:19px}\n  .tabs{flex-wrap:nowrap;overflow-x:auto;white-space:nowrap;scrollbar-width:none;padding-bottom:6px}\n  .tabs::-webkit-scrollbar{display:none}\n  .tabs a{flex:none}\n  .panel{padding:12px}\n  h1.pg-title{font-size:19px}\n  .row{flex-wrap:wrap;gap:5px 8px;padding:10px 0;align-items:flex-start}\n  .rank{order:1;min-width:0;font-size:15px;gap:4px}\n  .rtitle{order:2;flex:1 1 52%;font-size:14.5px}\n  .heat{order:3;margin-left:auto}\n  .hv b{font-size:18px}\n  .tag{order:6} .time{order:7} .avas{order:8} .row .note{order:9}\n  .slider-row{gap:8px}\n  .stats{flex-wrap:wrap;gap:12px 18px}\n  .big{font-size:30px}\n  table{display:block;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch}\n  .about-body{font-size:14px}\n}\n.copy{margin-top:10px}\n.copy a{color:var(--sub)}\n.share{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}\n.sh{border:1px solid var(--line);border-radius:6px;padding:4px 11px;font-size:12.5px;\n color:var(--sub);background:none;cursor:pointer;font-family:inherit;text-decoration:none}\n.sh:hover{color:var(--teal);border-color:var(--teal)}\n.sh{display:inline-flex;align-items:center;gap:5px}\n.sh svg{flex:none}\na.tag{text-decoration:none}\na.badge{text-decoration:none;color:inherit}\n.tagchips{display:flex;flex-wrap:wrap;gap:8px}\n.tagchip{border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:13px;color:var(--sub);text-decoration:none}\n.tagchip:hover{color:var(--teal);border-color:var(--teal)}\n.orig ul{margin:6px 0 0;padding-left:18px}\n.orig li{margin:3px 0;word-break:break-all;font-size:13.5px}\n.tagchip.on{color:var(--ink);border-color:var(--teal);font-weight:700}\n.cfgchips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 2px 43px}\n.cfg{font-size:11px;border:1px solid var(--line);border-radius:999px;padding:1px 8px;color:var(--sub);font-family:var(--mono)}\n.cfg.off{color:var(--red);border-color:var(--red)}\n.cfgrule{margin:0 0 4px 43px}\n.cfgpre{font-family:var(--mono);font-size:12px;line-height:1.6;white-space:pre;overflow-x:auto;background:rgba(127,127,127,.07);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:6px 0 12px 43px;color:var(--sub)}\n.cfgpre.full{margin-left:0}\n.subh{font-weight:700;margin:16px 0 2px}\n.ol-list{margin:6px 0 4px;padding-left:20px}\n.ol-list li{margin:6px 0;line-height:1.65}\n.tips{margin:6px 0 4px;padding-left:18px}\n.tips li{margin:5px 0;line-height:1.65}\n.help{margin:12px 0 4px}\n.help summary{cursor:pointer;color:var(--teal);font-size:13.5px}\n.helpbody{color:var(--sub);font-size:13.5px;line-height:1.75;padding:8px 2px 2px}\n.helpbody b{color:var(--ink)}\n.detail p{margin:12px 0 18px;line-height:1.85}\n.orig{margin-top:24px}\n.cfgdet{margin:2px 0 10px 43px}\n.cfgdet summary{cursor:pointer;color:var(--sub);font-size:12.5px;font-family:var(--mono)}\n.cfgdet .cfgpre{margin:8px 0 4px 0}\ntd a{color:var(--teal)}\n.note{color:var(--faint);font-size:12.5px}\n.slider-box{display:flex;align-items:center;gap:14px;border:1px solid var(--line);\n background:var(--panel);border-radius:8px;padding:10px 16px;margin-top:12px}\n.slider-box input[type=range]{flex:1;accent-color:#5eead4;height:28px;cursor:pointer}\n.slider-cap{color:var(--faint);font-size:12px;white-space:nowrap}\n.slider-cur{font-family:var(--mono);font-size:13px;color:var(--ink);white-space:nowrap}\n@media (max-width:700px){.avatars{display:none}.time{display:none}.deltas{min-width:74px}}\n.pscore{flex:none;font-size:11.5px;font-family:var(--mono);color:var(--sub);border:1px solid var(--line);border-radius:999px;padding:1px 8px;white-space:nowrap}\n";

export const SOURCE_DOMAINS: Record<string, string> = {
 "Hacker News": "news.ycombinator.com",
 "Google News": "news.google.com",
 "Google News 多家": "news.google.com",
 "TechCrunch": "techcrunch.com",
 "Reddit": "reddit.com",
 "Reddit r/artificial": "reddit.com",
 "Reddit r/LocalLLaMA": "reddit.com",
 "Reddit r/technology": "reddit.com",
 "GitHub": "github.com",
 "GitHub Trending": "github.com",
 "Hugging Face": "huggingface.co",
 "Hugging Face 博客": "huggingface.co",
 "Product Hunt": "producthunt.com",
 "CNBC": "cnbc.com",
 "WSJ": "wsj.com",
 "NYT": "nytimes.com",
 "Reuters": "reuters.com",
 "The Verge": "theverge.com",
 "BBC": "bbc.com",
 "WIRED": "wired.com",
 "X": "x.com",
 "OpenRouter": "openrouter.ai",
 "VentureBeat": "venturebeat.com",
 "Anthropic": "anthropic.com",
 "Anthropic 官方": "anthropic.com",
 "DeepMind": "deepmind.google",
 "CBS": "cbsnews.com",
 "Microsoft Research": "microsoft.com",
 "LangChain Blog": "langchain.com",
 "Google Blog": "blog.google",
 "Ollama Blog": "ollama.com",
 "Databricks Blog": "databricks.com",
 "Cloudflare Blog": "cloudflare.com",
 "GitHub Changelog": "github.blog",
 "Mozilla Blog": "mozilla.org",
 "SemiAnalysis": "semianalysis.com",
 "One Useful Thing": "oneusefulthing.org",
 "Platformer": "platformer.news",
 "YC Blog": "ycombinator.com",
 "LessWrong": "lesswrong.com",
 "Stack Exchange": "stackexchange.com",
 "Federal Register": "federalregister.gov",
 "llama.cpp Releases": "github.com",
 "vLLM Releases": "github.com",
 "Claude Code Releases": "github.com",
 "Interconnects": "interconnects.ai",
 "Ahead of AI": "magazine.sebastianraschka.com",
 "Dwarkesh Podcast": "dwarkesh.com",
 "USA Today": "usatoday.com",
 "blog.google": "blog.google",
 "Google 官方博客": "blog.google",
 "Google 官方": "blog.google",
 "Bloomberg": "bloomberg.com",
 "Bluesky": "bsky.app",
 "Microsoft 365 状态页": "microsoft.com",
 "OpenAI 官方博客": "openai.com",
 "The Decoder": "the-decoder.com",
 "Fortune": "fortune.com",
 "The Guardian": "theguardian.com",
 "Mastodon 趋势": "mastodon.social",
 "Wikipedia 热读榜": "wikipedia.org",
 "Crypto Briefing": "cryptobriefing.com",
 "Dealroom": "dealroom.co",
 "SEC S-1/A": "sec.gov",
 "SEC S-1 修订稿": "sec.gov",
 "webdevs.ro": "webdevs.ro",
 "edge0.ai": "edge0.ai"
};

export const CAT_KEYS: Record<string, string> = {
 "安全": "security",
 "政策与监管": "policy",
 "开源": "open-source",
 "商业与资本": "business",
 "Agent 与应用": "agent",
 "AI 模型": "ai-models",
 "行业动态": "industry"
};

export const SRC_ALIASES: Record<string, string> = {
 "hacker news": "hackernews",
 "show hn": "show_hn",
 "github": "github",
 "github trending": "github",
 "x": "x",
 "product hunt": "producthunt",
 "hugging face": "huggingface",
 "openrouter": "openrouter",
 "civitai": "civitai",
 "arxiv": "arxiv",
 "bluesky": "bluesky",
 "google news": "google_news",
 "google news 多家": "google_news",
 "google trends": "google_trends",
 "lobsters": "lobsters",
 "dev.to": "devto",
 "dev": "devto",
 "wikipedia": "wikipedia",
 "app store": "app_store",
 "daily papers": "daily_papers",
 "hf spaces": "hf_spaces",
 "hugging face spaces": "hf_spaces",
 "federal register": "federal_register",
 "stack exchange": "stackexchange",
 "github releases": "gh_releases",
 "google blog": "official_blogs",
 "llama.cpp releases": "gh_releases",
 "vllm releases": "gh_releases",
 "claude code releases": "gh_releases"
};

export const OFFICIAL_HINTS: string[] = [
 "官方",
 "official",
 "openai",
 "deepmind",
 "anthropic",
 "mistral",
 "nvidia",
 "blog.google",
 "bair",
 "langchain",
 "ollama",
 "databricks",
 "cloudflare",
 "mozilla",
 "federal register",
 "changelog"
];

export const TECH_HINTS: string[] = [
 "techcrunch",
 "the verge",
 "wired",
 "ars technica",
 "the decoder",
 "venturebeat",
 "fortune",
 "cnbc",
 "reuters",
 "bbc",
 "nyt",
 "wsj",
 "cbs",
 "usa today",
 "the guardian",
 "bloomberg",
 "forbes",
 "technology review",
 "techmeme",
 "the information",
 "semafor",
 "semianalysis",
 "platformer",
 "lesswrong",
 "one useful thing",
 "y combinator",
 "yc blog",
 "stack exchange"
];

export const SHARE_ICONS: Record<string, string> = {
 "x": "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L2 3h6.4l4.4 5.9L17.8 3zm-1.1 16.1h1.7L7.4 4.8H5.6l11.1 14.3z\"/></svg>",
 "facebook": "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.6-1.5h1.4V4.4c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7v2.5H8.3v3h2.5V21h2.7z\"/></svg>",
 "linkedin": "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"currentColor\" aria-hidden=\"true\"><rect x=\"3\" y=\"9\" width=\"3.4\" height=\"9.5\"/><circle cx=\"4.7\" cy=\"4.9\" r=\"1.9\"/><path d=\"M9.5 18.5V9h3v1.4c.5-.9 1.6-1.7 3.3-1.7 2.6 0 4.2 1.7 4.2 5.1v4.7h-3.4v-4.3c0-1.5-.6-2.5-2-2.5-1.4 0-2.3.9-2.3 2.5v4.3H9.5z\"/></svg>",
 "telegram": "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M21.9 3.3l-3.1 14.6c-.2 1-.8 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.7-4.8 8.8-7.9c.4-.3-.1-.5-.6-.2L7.2 11.6 2.7 10.2c-1-.3-1-1 .2-1.4l17.6-6.8c.8-.3 1.5.2 1.4 1.3z\"/></svg>",
 "email": "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M3 5h18c.6 0 1 .4 1 1v12c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1V6c0-.6.4-1 1-1zm9 7.4L4.2 7h15.6L12 12.4z\"/></svg>",
 "reddit": "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"currentColor\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"13.2\" r=\"6.8\"/><path d=\"M12 6.4l1.1-3.6 3.4.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"/><circle cx=\"18.6\" cy=\"3.4\" r=\"1.4\"/></svg>",
 "weibo": "",
 "copy": "<svg viewBox=\"0 0 24 24\" width=\"13\" height=\"13\" fill=\"currentColor\" aria-hidden=\"true\"><path d=\"M10.6 13.4a4 4 0 005.7 0l3-3a4 4 0 10-5.7-5.7l-1.5 1.5 1.4 1.4 1.5-1.5a2 2 0 112.9 2.9l-3 3a2 2 0 01-2.9 0 2 2 0 010-2.9l1.5-1.5-1.4-1.4-1.5 1.5a4 4 0 000 5.8zM13.4 10.6a4 4 0 00-5.7 0l-3 3a4 4 0 105.7 5.7l1.5-1.5-1.4-1.4-1.5 1.5a2 2 0 11-2.9-2.9l3-3a2 2 0 012.9 0 2 2 0 010 2.9l-1.5 1.5 1.4 1.4 1.5-1.5a4 4 0 000-5.8z\"/></svg>"
};

export const SHARE_PLATFORMS: Record<string, [string, string]> = {
 "x": [
  "X",
  "https://twitter.com/intent/tweet?text={t}&url={u}"
 ],
 "facebook": [
  "Facebook",
  "https://www.facebook.com/sharer/sharer.php?u={u}"
 ],
 "linkedin": [
  "LinkedIn",
  "https://www.linkedin.com/sharing/share-offsite/?url={u}"
 ],
 "telegram": [
  "Telegram",
  "https://t.me/share/url?url={u}&text={t}"
 ],
 "reddit": [
  "Reddit",
  "https://www.reddit.com/submit?url={u}&title={t}"
 ],
 "email": [
  "Email",
  "mailto:?subject={t}&body={u}"
 ],
 "weibo": [
  "微博",
  "https://service.weibo.com/share/share.php?url={u}&title={t}"
 ]
};

export const SLOT: Record<string, [string, number]> = {
 "pilot": [
  "试跑",
  0
 ],
 "morning": [
  "早报",
  1
 ],
 "evening": [
  "晚报",
  2
 ]
};

/** Slot labels per language (SLOT above keeps the zh label + order;
 * the archive page renders the label in the language being built). */

export const LEVELS: Record<string, [string, string]> = {
 "must": [
  "🔥",
  "必看"
 ],
 "watch": [
  "👀",
  "关注"
 ],
 "echo": [
  "🌀",
  "回波"
 ]
};
