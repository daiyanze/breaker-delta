// Site generation, ported from radar/publish.py (`build`,
// `build_site`, `write_data_files`, `write_discovery`). Python's
// mutable globals (CUR/OUT/BASE_URL/FAV_FILES/...) become the
// explicit Ctx threaded through every call; output is byte-identical.

import * as fs from "node:fs";
import * as path from "node:path";

import {
  alertsData,
  buildTopics,
  parseTrackRecordFile,
  RESERVED_FILES,
  slugify,
  topicFile,
  topicsData,
  type Edition,
} from "@breaker-delta/core";

import {
  catName,
  langPrefix,
  levelLabel,
  makeCtx,
  s,
  sArr,
  type BuildOptions,
  type Ctx,
} from "./ctx.js";
import { DOC_PAGES, JA_DOCS_NOTICE, docsNav } from "./docs.js";
import { fetchFavicons } from "./favicon.js";
import { loadConfigBlocks, loadEditions, sourceBlock, sourceKey } from "./load.js";
import {
  ABOUT,
  HOOK_T,
  HTML_LANG,
  LEVELS,
  LONG_TIPS,
  SHORT_TIPS,
  SLOT,
  SLOT_LABEL_I18N,
  SOURCE_DOMAINS,
} from "./literals.js";
import {
  cpCompare,
  cpSlice,
  esc,
  firstAlnum,
  formatRfc2822,
  parseIso,
  pyFixed,
  pyFormat,
  pyJsonDumps,
  pyQuote,
  sumOrd,
  urlNetloc,
} from "./py.js";
import {
  catFile,
  catKey,
  deltaChips,
  edFile,
  edLabel,
  foot,
  footDocs,
  heatHelp,
  locApp,
  locEditionTitle,
  locTopicName,
  mast,
  mastDocs,
  page,
  rowHtml,
  shareLinks,
  srcName,
  topicHref,
  trendPoints,
  tstamp,
  waveChart,
} from "./render.js";
import type { App, BoardState, PubTopic, SourceStat } from "./types.js";

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

function write(ctx: Ctx, fname: string, content: string): void {
  fs.writeFileSync(path.join(ctx.langDir, fname), content, "utf-8");
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** First sentence of a text, per Python's
 *  re.split(r"(?<=[。！？.!?])\s*", text, maxsplit=1)[0]: everything
 *  up to and including the first sentence-ending character. */
function firstSentence(text: string): string {
  const m = /[。！？.!?]/.exec(text);
  if (!m) return text;
  return text.slice(0, m.index + 1);
}

/**
 * publish.py `build`: load, build topics, warm the favicon cache,
 * then render every language into outDir (zh at the root), followed
 * by the data layer and discovery files at the site root. Returns
 * the sorted list of written HTML paths, like Python's.
 */
export async function buildSite(options: BuildOptions): Promise<string[]> {
  const ctx = makeCtx(options);
  const out = ctx.outDir;
  fs.mkdirSync(out, { recursive: true });
  const { editions, ledger } = loadEditions(ctx);
  const topics = buildTopics(editions, ledger, ctx.catRules) as PubTopic[];
  const domainSet = new Set<string>();
  for (const t of topics) {
    for (const a of t.apps) {
      for (const src of a.sources) {
        if (hasOwn(SOURCE_DOMAINS, src)) domainSet.add(SOURCE_DOMAINS[src]);
      }
    }
  }
  const domains = [...domainSet].sort(cpCompare);
  await fetchFavicons(ctx, domains);
  const assetsDir = path.join(ctx.rootDir, "assets");
  const banner = path.join(assetsDir, "banner.png");
  const bannerExists = fs.existsSync(banner);
  if (bannerExists) ctx.ogImg = true;
  const brand = [
    "favicon.svg", "favicon-32.png", "apple-touch-icon.png", "banner.png", "icon-96.png",
  ];
  for (const lang of ctx.langs) {
    ctx.lang = lang;
    ctx.langDir = lang === "zh" ? out : path.join(out, lang);
    fs.mkdirSync(ctx.langDir, { recursive: true });
    if (bannerExists) {
      fs.copyFileSync(banner, path.join(ctx.langDir, "og-image.png"));
    }
    for (const bf of brand) {
      const srcf = path.join(assetsDir, bf);
      if (fs.existsSync(srcf)) fs.copyFileSync(srcf, path.join(ctx.langDir, bf));
    }
    buildSiteLang(ctx, editions, topics);
  }
  ctx.lang = "zh";
  writeDataFiles(ctx, editions, topics);
  writeDiscovery(ctx, editions, topics);
  const written: string[] = [];
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".html")) written.push(p);
    }
  };
  walk(out);
  return written.sort(cpCompare);
}

/** Main-site pages the docs bodies link to relatively; on the docs
 *  site those links are rewritten to absolute mainUrl addresses. */
const DOCS_MAIN_LINKS = [
  "index.html", "rising.html", "echoes.html", "submit.html",
  "categories.html", "sources.html", "track-record.html",
  "archive.html", "about.html",
];

function rewriteMainLinks(ctx: Ctx, html: string): string {
  const prefix = ctx.lang === "zh" ? "" : ctx.lang + "/";
  let out = html;
  for (const f of DOCS_MAIN_LINKS) {
    out = out.split(`href="${f}"`).join(`href="${ctx.mainUrl}${prefix}${f}"`);
  }
  return out;
}

/**
 * Build the standalone docs site (docs.breakerdelta.com): the same 8
 * bilingual pages that used to ship inside the main site, rendered
 * with the docs shell (mastDocs / footDocs), their own base URL for
 * canonical / hreflang / sitemap, an index.html redirect stub per
 * language, and brand files copied from the engine assets. Needs no
 * editions or data dir. Returns the written HTML paths.
 */
export function buildDocsSite(options: BuildOptions): string[] {
  const docsUrl = options.docsUrl ?? "https://docs.breakerdelta.com/";
  const ctx = makeCtx({ ...options, baseUrl: docsUrl });
  const out = ctx.outDir;
  fs.mkdirSync(out, { recursive: true });
  const assetsDir = path.join(ctx.rootDir, "assets");
  const banner = path.join(assetsDir, "banner.png");
  if (fs.existsSync(banner)) ctx.ogImg = true;
  const brand = [
    "favicon.svg", "favicon-32.png", "apple-touch-icon.png", "banner.png", "icon-96.png",
  ];
  const written: string[] = [];
  for (const lang of ctx.langs) {
    ctx.lang = lang;
    ctx.langDir = lang === "zh" ? out : path.join(out, lang);
    fs.mkdirSync(ctx.langDir, { recursive: true });
    if (ctx.ogImg) fs.copyFileSync(banner, path.join(ctx.langDir, "og-image.png"));
    for (const bf of brand) {
      const srcf = path.join(assetsDir, bf);
      if (fs.existsSync(srcf)) fs.copyFileSync(srcf, path.join(ctx.langDir, bf));
    }
    const docLang = lang === "zh" ? "zh" : "en";
    const notice = lang === "ja" ? JA_DOCS_NOTICE : "";
    for (const doc of DOC_PAGES) {
      const docBody =
        mastDocs(ctx, doc.file) +
        docsNav(ctx.lang, doc.file) +
        notice +
        rewriteMainLinks(ctx, doc.body[docLang]) +
        footDocs(ctx);
      let html = page(ctx, doc.title[docLang], docBody, {
        path: doc.file,
        desc: doc.desc[docLang],
      });
      // The docs site has no feeds of its own; drop page()'s feed links.
      html = html
        .replace(/<link rel="alternate" type="application\/rss\+xml"[^>]*>/, "")
        .replace(/<link rel="alternate" type="application\/atom\+xml"[^>]*>/, "");
      write(ctx, doc.file, html);
      written.push(path.join(ctx.langDir, doc.file));
    }
    const prefix = lang === "zh" ? "" : lang + "/";
    const stub =
      `<!DOCTYPE html>\n<html><head><meta charset="utf-8">` +
      `<meta http-equiv="refresh" content="0; url=docs.html">` +
      `<link rel="canonical" href="${ctx.docsUrl}${prefix}docs.html">` +
      `<title>Breaker Delta Docs</title></head>` +
      `<body><p><a href="docs.html">Breaker Delta Docs</a></p></body></html>`;
    write(ctx, "index.html", stub);
    written.push(path.join(ctx.langDir, "index.html"));
  }
  const sm: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const lang of ctx.langs) {
    const prefix = lang === "zh" ? "" : lang + "/";
    for (const doc of DOC_PAGES) {
      sm.push(`<url><loc>${ctx.docsUrl}${prefix}${doc.file}</loc></url>`);
    }
  }
  sm.push("</urlset>");
  fs.writeFileSync(path.join(out, "sitemap.xml"), sm.join("\n"), "utf-8");
  fs.writeFileSync(
    path.join(out, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${ctx.docsUrl}sitemap.xml\n`,
    "utf-8",
  );
  return written.sort(cpCompare);
}

/** data/topics.json + data/alerts.json at the site root (indent=1). */
export function writeDataFiles(ctx: Ctx, editions: Edition[], topics: PubTopic[]): void {
  const d = path.join(ctx.outDir, "data");
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(
    path.join(d, "topics.json"),
    pyJsonDumps(topicsData(editions, topics), 1),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(d, "alerts.json"),
    pyJsonDumps(alertsData(editions, topics), 1),
    "utf-8",
  );
}

/** sitemap.xml + robots.txt + llms.txt at the site root. */
export function writeDiscovery(ctx: Ctx, editions: Edition[], topics: PubTopic[]): void {
  const out = ctx.outDir;
  const latest = editions[editions.length - 1];
  const defaultMod = cpSlice(latest.published_at ?? "", 0, 10);
  const modMap = new Map<string, string>();
  for (const t of topics) {
    const lastApp = t.apps[t.apps.length - 1];
    modMap.set(
      topicFile(t),
      cpSlice((lastApp.published ?? "") || defaultMod, 0, 10),
    );
  }
  for (const ed of editions) {
    modMap.set(edFile(ed), cpSlice((ed.published_at ?? "") || defaultMod, 0, 10));
  }
  const sm: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const lang of ctx.langs) {
    const prefix = lang === "zh" ? "" : lang + "/";
    const folder = lang === "zh" ? out : path.join(out, lang);
    const names = fs
      .readdirSync(folder)
      .filter((n) => n.endsWith(".html"))
      .sort(cpCompare);
    for (const name of names) {
      if (/^topic-t\d+\.html$/.test(name)) continue; // redirect stub, noindex
      sm.push(
        `<url><loc>${ctx.baseUrl}${prefix}${pyQuote(name, "-._~")}</loc>` +
          `<lastmod>${modMap.get(name) ?? defaultMod}</lastmod></url>`,
      );
    }
  }
  sm.push("</urlset>");
  fs.writeFileSync(path.join(out, "sitemap.xml"), sm.join("\n"), "utf-8");
  fs.writeFileSync(
    path.join(out, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${ctx.baseUrl}sitemap.xml\n`,
    "utf-8",
  );
  const sts = [...topics]
    .sort((a, b) => b.apps[b.apps.length - 1].heat - a.apps[a.apps.length - 1].heat)
    .slice(0, 10);
  const topLinks = sts
    .map(
      (t) =>
        `- [${t.apps[t.apps.length - 1].title}](${ctx.baseUrl}${topicHref(t)})`,
    )
    .join("\n");
  const langLinks = ctx.langs
    .map(
      (L) =>
        `- [${HTML_LANG[L]}](${ctx.baseUrl}${L === "zh" ? "" : L + "/"}index.html)`,
    )
    .join("\n");
  const llms =
    `# 浪尖雷达 Breaker Delta\n\n> 用「浪高」量化话题走势的热点雷达：海浪榜（全部话题按浪高排名）、` +
    `涨潮榜（浪高涨幅）、回波（新出现的话题），每个话题有独立页面与海浪图（浪高历史走势）。\n\n` +
    `## 主要页面\n- [海浪榜](${ctx.baseUrl}index.html)\n- [涨潮榜](${ctx.baseUrl}rising.html)\n` +
    `- [回波](${ctx.baseUrl}echoes.html)\n- [分类](${ctx.baseUrl}categories.html)\n` +
    `- [数据源](${ctx.baseUrl}sources.html)\n- [战绩](${ctx.baseUrl}track-record.html)\n` +
    `- [投波](${ctx.baseUrl}submit.html)\n- [关于](${ctx.baseUrl}about.html)\n- [文档 Docs](${ctx.docsUrl}docs.html)\n- [Docs (English)](${ctx.docsUrl}en/docs.html)\n` +
    `- [往期归档](${ctx.baseUrl}archive.html)\n- [RSS](${ctx.baseUrl}feed.xml)\n` +
    `- [Atom](${ctx.baseUrl}atom.xml)\n\n## 语言版本\n${langLinks}\n\n## 当前浪高最高的话题\n${topLinks}\n`;
  fs.writeFileSync(path.join(out, "llms.txt"), llms, "utf-8");
}

/**
 * The index page's inline slider script, verbatim from publish.py
 * (the part after the embedded D/T JSON payloads).
 */
const SLIDER_JS =
  ";const sl=document.getElementById('tslider'),bd=document.getElementById('board')," +
  "lb=document.getElementById('tlabel'),ct=document.getElementById('tcount')," +
  "tk=[...document.querySelectorAll('.tick')];const cache={};" +
  "function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML}" +
  "function spark(p){if(!p||!p.length)return '';" +
  "if(p.length===1)return '<svg class=\"spark-svg\" viewBox=\"0 0 64 26\" width=\"64\" height=\"26\"><circle cx=\"60\" cy=\"13\" r=\"2.6\" fill=\"currentColor\"/></svg>';" +
  "const lo=Math.min(...p),hi=Math.max(...p),rg=(hi-lo)||1,W=64,H=26,P=3;" +
  "const pts=p.map((v,i)=>[P+i*(W-2*P)/(p.length-1),H-P-(v-lo)/rg*(H-2*P)]);" +
  "const line=pts.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ');" +
  "const area='M'+pts[0][0].toFixed(1)+','+H+' '+pts.map(q=>'L'+q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ')+' L'+pts[pts.length-1][0].toFixed(1)+','+H+' Z';" +
  "const e=pts[pts.length-1];" +
  "return '<svg class=\"spark-svg\" viewBox=\"0 0 64 26\" width=\"64\" height=\"26\"><path d=\"'+area+'\" fill=\"currentColor\" opacity=\".16\"/><polyline points=\"'+line+'\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"'+e[0].toFixed(1)+'\" cy=\"'+e[1].toFixed(1)+'\" r=\"2.6\" fill=\"currentColor\"/></svg>'}" +
  "function hdHtml(d){if(d.hd===null)return '<span class=\"hdelta new\">'+T.new+'</span>';" +
  "if(d.hd>0)return '<span class=\"hdelta up\">▲'+d.hd+'</span>';" +
  "if(d.hd<0)return '<span class=\"hdelta down\">▼'+(-d.hd)+'</span>';" +
  "return '<span class=\"hdelta\">→0</span>'}" +
  "function avs(d){let h='';for(const x of d.srcs){" +
  "h+=x.img?'<img class=\"avimg\" src=\"favicons/'+x.img+'\" title=\"'+esc(x.n)+'\" loading=\"lazy\">':'<span class=\"av\" style=\"background:hsl('+x.hue+' 65% 72%)\" title=\"'+esc(x.n)+'\">'+esc(x.ch)+'</span>'}" +
  "if(d.more)h+='<span class=\"more-n\">+'+d.more+'</span>';" +
  "return '<span class=\"avatars\">'+h+'</span>'}" +
  "function rdHtml(d){if(d.rd===null)return '<span class=\"hdelta new\">'+T.new+'</span>';" +
  "if(d.rd>0)return '<span class=\"hdelta up\">▲'+d.rd+'</span>';" +
  "if(d.rd<0)return '<span class=\"hdelta down\">▼'+(-d.rd)+'</span>';" +
  "return '<span class=\"hdelta\">→</span>'}" +
  "function row(d){return '<div class=\"row\"><span class=\"rank'+(d.r<=3?' top':'')+'\">'+d.r+rdHtml(d)+(d.pr!==null?'<span class=\"prank\">'+T.prev+' '+d.pr+'</span>':'')+'</span>'" +
  "+'<span class=\"rtitle\"><a href=\"'+d.file+'\">'+esc(d.title)+'</a>'+(d.carried?' <span class=\"note\">'+T.carried+'</span>':'')+'</span>'" +
  "+'<a class=\"tag\" href=\"category-'+d.ck+'.html\">'+esc(d.cat)+'</a><span class=\"time\">'+d.time+'</span>'+avs(d)" +
  "+'<span class=\"heat\"><span class=\"spark\">'+spark(d.sp)+'</span><span class=\"hv\"><b>'+d.heat+'</b> <span>'+T.wave+'</span> '+hdHtml(d)+'</span></span></div>'}" +
  "let raf=0;function show(i){" +
  "if(!cache[i])cache[i]=D[i].rows.map(row).join('');" +
  "bd.innerHTML=cache[i];" +
  "lb.textContent=D[i].label+' · '+(i===D.length-1?T.current:T.hist);" +
  "ct.textContent=T.count.replace('{n}',D[i].rows.length);" +
  "tk.forEach((t,j)=>t.classList.toggle('on',j===i));}" +
  "sl.addEventListener('input',()=>{const i=+sl.value;" +
  "cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>show(i))});" +
  "tk.forEach((t,j)=>{const a=t.querySelector('a');" +
  "if(a)a.addEventListener('click',e=>{e.preventDefault();sl.value=j;show(j);});});</script>";

/** publish.py `build_site`: every page of one language edition. */
function buildSiteLang(ctx: Ctx, editions: Edition[], topics: PubTopic[]): void {
  const OUT = ctx.langDir;
  const PER = ctx.per;
  for (const name of fs.readdirSync(OUT)) {
    if (name.endsWith(".html")) fs.unlinkSync(path.join(OUT, name));
  }
  const favOut = path.join(OUT, "favicons");
  fs.rmSync(favOut, { recursive: true, force: true });
  fs.mkdirSync(favOut, { recursive: true });
  for (const [, fname] of ctx.favFiles) {
    fs.copyFileSync(path.join(ctx.faviconCacheDir, fname), path.join(favOut, fname));
  }
  const latestEi = editions.length - 1;
  const latest = editions[latestEi];

  const tmap = new Map<string, [PubTopic, App]>();
  for (const t of topics) {
    for (const a of t.apps) tmap.set(`${a.edition}\u0000${a.title}`, [t, a]);
  }

  // Board states: at each edition, every topic known so far, valued at
  // its most recent appearance (carried forward when not updated).
  const states: Map<string, BoardState>[] = [];
  let prev = new Map<string, { heat: number; rank: number }>();
  for (let ei = 0; ei < editions.length; ei++) {
    const cur = new Map<string, BoardState>();
    for (const t of topics) {
      const appsLe = t.apps.filter((a) => a.edition <= ei);
      if (appsLe.length === 0) continue;
      const a = appsLe[appsLe.length - 1];
      cur.set(t.key, {
        topic: t,
        app: a,
        heat: a.heat,
        carried: a.edition !== ei,
        rank: 0,
        heat_delta: null,
        rank_delta: null,
      });
    }
    const ranked = [...cur.values()].sort((x, y) => y.heat - x.heat);
    ranked.forEach((st, i) => {
      const rank = i + 1;
      st.rank = rank;
      const pa = prev.get(st.topic.key);
      st.heat_delta = pa ? st.heat - pa.heat : null;
      st.rank_delta = pa ? pa.rank - rank : null;
    });
    const byKey = new Map<string, BoardState>();
    for (const st of ranked) byKey.set(st.topic.key, st);
    states.push(byKey);
    prev = new Map(
      [...byKey].map(([k, v]) => [k, { heat: v.heat, rank: v.rank }] as const),
    );
  }
  for (const t of topics) {
    let prevBr: number | null = null;
    for (const a of t.apps) {
      const st = states[a.edition].get(t.key);
      a.board_rank = st ? st.rank : a.rank;
      a.board_rank_delta =
        prevBr !== null ? prevBr - (a.board_rank as number) : null;
      prevBr = a.board_rank as number;
    }
  }

  const boardRows = (ei: number): [string, number] => {
    const sts = [...states[ei].values()].sort((x, y) => x.rank - y.rank);
    let out = "";
    for (const st of sts.slice(0, PER)) {
      const a: App = {
        ...st.app,
        heat_delta: st.heat_delta,
        rank_delta: st.rank_delta,
        carried: st.carried,
      };
      out += rowHtml(ctx, st.rank, st.topic, a);
    }
    return [out, sts.length];
  };

  // Slider states: only the most recent 60 time points are embedded.
  const MAX_STATES = 60;
  const win = range(editions.length).slice(
    Math.max(0, editions.length - MAX_STATES),
  );
  const counts = new Map<number, number>();
  for (const ei of win) counts.set(ei, states[ei].size);

  const rowData = (st: BoardState): Record<string, unknown> => {
    const a = st.app;
    const srcs: Record<string, unknown>[] = [];
    for (const src of a.sources.slice(0, 4)) {
      const dom = hasOwn(SOURCE_DOMAINS, src) ? SOURCE_DOMAINS[src] : undefined;
      if (dom && ctx.favFiles.has(dom)) {
        srcs.push({ img: ctx.favFiles.get(dom), n: srcName(ctx, src) });
      } else {
        srcs.push({ ch: firstAlnum(srcName(ctx, src)), hue: sumOrd(src) % 360, n: srcName(ctx, src) });
      }
    }
    return {
      r: st.rank,
      file: topicHref(st.topic),
      title: locApp(ctx, a).title,
      cat: catName(ctx, a.category),
      ck: catKey(a.category),
      time: tstamp(a),
      pr: st.rank_delta !== null ? st.rank + st.rank_delta : null,
      heat: a.heat,
      hd: st.heat_delta,
      rd: st.rank_delta,
      carried: st.carried,
      srcs,
      more: Math.max(0, a.sources.length - 4),
      sp: trendPoints(st.topic, a),
    };
  };

  const sliderStates = win.map((ei) => {
    const sts = [...states[ei].values()]
      .sort((x, y) => x.rank - y.rank)
      .slice(0, PER);
    return { label: edLabel(editions[ei]), rows: sts.map(rowData) };
  });
  const labels = sliderStates.map((x) => x.label);
  const [latestRowsHtml] = boardRows(latestEi);
  const slider =
    `<div class="slider-box"><span class="slider-cap">${s(ctx, "slider")}</span>` +
    `<input type="range" id="tslider" min="0" max="${win.length - 1}" step="1" value="${win.length - 1}">` +
    `<span class="slider-cur" id="tlabel">${labels[labels.length - 1]} · ${s(ctx, "current")}</span></div>`;
  const i18nJs = {
    wave: s(ctx, "wave"),
    rank: s(ctx, "rank"),
    carried: s(ctx, "carried"),
    new: s(ctx, "new"),
    current: s(ctx, "current"),
    hist: s(ctx, "hist"),
    count: s(ctx, "count"),
    prev: s(ctx, "prev"),
  };
  const script =
    "<script>const D=" +
    pyJsonDumps(sliderStates) +
    ",T=" +
    pyJsonDumps(i18nJs) +
    SLIDER_JS;
  let pagerHtml = "";
  const latestCount = counts.get(latestEi) as number;
  if (latestCount > PER) {
    const npg = Math.ceil(latestCount / PER);
    const links =
      '<span class="on">1</span>' +
      range(npg)
        .slice(1)
        .map((q) => `<a href="board-${q + 1}.html">${q + 1}</a>`)
        .join("");
    pagerHtml = `<div class="pager">${links}</div>`;
  }
  const indexBody =
    mast(ctx, "index", editions.slice(editions.length - win.length), {
      currentEi: win.length - 1,
      fname: "index.html",
      tl: true,
    }) +
    slider +
    `<section class="panel"><div class="panel-h"><span>${s(ctx, "board_title")}</span>` +
    `<span class="r" id="tcount">${pyFormat(s(ctx, "count"), { n: latestCount })}</span></div>` +
    `<div id="board">${latestRowsHtml}</div></section>` +
    pagerHtml +
    heatHelp(ctx) +
    foot(ctx) +
    script;
  const siteLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: s(ctx, "site_name"),
    url: ctx.baseUrl + (ctx.lang === "zh" ? "" : ctx.lang + "/"),
    inLanguage: HTML_LANG[ctx.lang],
  };
  write(
    ctx,
    "index.html",
    page(ctx, sArr(ctx, "tabs")[0], indexBody, { path: "index.html", ld: siteLd }),
  );

  const writePaged = (
    fname1: string,
    title: string,
    mastKey: string,
    header: string,
    chunks: string[],
    per: number,
    opts?: { desc?: string | null; prefix?: string },
  ): void => {
    const prefix = opts?.prefix ?? "";
    const desc = opts?.desc ?? null;
    const npg = Math.max(1, Math.ceil(chunks.length / per));
    for (let p = 0; p < npg; p++) {
      const fn = p === 0 ? fname1 : fname1.replaceAll(".html", `-${p + 1}.html`);
      let links = "";
      if (npg > 1) {
        links =
          '<div class="pager">' +
          range(npg)
            .map((q) =>
              q === p
                ? `<span class="on">${q + 1}</span>`
                : `<a href="${q === 0 ? fname1 : fname1.replaceAll(".html", `-${q + 1}.html`)}">${q + 1}</a>`,
            )
            .join("") +
          "</div>";
      }
      const body =
        mast(ctx, mastKey, editions, { fname: fn }) +
        prefix +
        `<section class="panel">${header}` +
        chunks.slice(p * per, (p + 1) * per).join("") +
        "</section>" +
        links +
        foot(ctx);
      write(
        ctx,
        fn,
        page(ctx, p === 0 ? title : `${title} · ${p + 1}`, body, {
          desc,
          path: fn,
        }),
      );
    }
  };

  // echoes page: latest echoes + echo appearances of last 3 editions
  const echoApps: [PubTopic, App][] = [];
  for (const t of topics) {
    for (const a of t.apps) {
      if (a.level === "echo" && a.edition >= latestEi - 2) echoApps.push([t, a]);
    }
  }
  echoApps.sort(
    (x, y) => y[1].edition - x[1].edition || y[1].heat - x[1].heat,
  );
  const srows = echoApps.map(([t, a], i) =>
    rowHtml(ctx, i + 1, t, a, false).replaceAll(
      '\n<span class="heat">',
      `\n<span class="note">${edLabel(editions[a.edition])}</span>\n<span class="heat">`,
    ),
  );
  const sheader =
    `<div class="panel-h"><span>${s(ctx, "seeds_title")}</span>` +
    `<span class="r">${s(ctx, "seeds_r")}</span></div>`;
  const echoCta =
    `<section class="panel"><div class="detail">` +
    `<a href="submit.html">${s(ctx, "sub_cta")}</a></div></section>`;
  writePaged("echoes.html", sArr(ctx, "tabs")[2], "echoes", sheader, srows, PER, {
    desc: s(ctx, "desc_seeds"),
    prefix: echoCta,
  });
  // Legacy URL: the echoes page lived at seeds.html before the
  // 2026-11-15 seed->echo rename; keep old links working.
  write(
    ctx,
    "seeds.html",
    `<!doctype html><meta charset="utf-8"><title>Echoes</title>` +
      `<meta http-equiv="refresh" content="0; url=echoes.html">` +
      `<link rel="canonical" href="${ctx.baseUrl}${langPrefix(ctx)}echoes.html">` +
      `<p><a href="echoes.html">Echoes</a></p>`,
  );

  // Overflow board pages (only when topics exceed one page of 100)
  const stsLatest = [...states[latestEi].values()].sort(
    (x, y) => x.rank - y.rank,
  );
  if (stsLatest.length > PER) {
    const npg = Math.ceil(stsLatest.length / PER);
    for (let p = 1; p < npg; p++) {
      let orows = "";
      for (const st of stsLatest.slice(p * PER, (p + 1) * PER)) {
        const a: App = {
          ...st.app,
          heat_delta: st.heat_delta,
          rank_delta: st.rank_delta,
          carried: st.carried,
        };
        orows += rowHtml(ctx, st.rank, st.topic, a, true);
      }
      const links =
        '<a href="index.html">1</a>' +
        range(npg)
          .slice(1)
          .map((q) =>
            q === p
              ? `<span class="on">${q + 1}</span>`
              : `<a href="board-${q + 1}.html">${q + 1}</a>`,
          )
          .join("");
      const body =
        mast(ctx, "index", editions, { fname: `board-${p + 1}.html` }) +
        `<section class="panel"><div class="panel-h"><span>${s(ctx, "board_title")}</span>` +
        `<span class="r">${pyFormat(s(ctx, "page_of"), { p: p + 1, n: npg })}</span></div>` +
        orows +
        `</section><div class="pager">${links}</div>` +
        foot(ctx);
      write(
        ctx,
        `board-${p + 1}.html`,
        page(ctx, `${sArr(ctx, "tabs")[0]} · ${p + 1}`, body, {
          path: `board-${p + 1}.html`,
        }),
      );
    }
  }

  // source stats + detail-page filenames (topic pages link to them)
  const sstat = new Map<string, SourceStat>();
  for (const t of topics) {
    for (const a of t.apps) {
      for (const src of a.sources) {
        let e = sstat.get(src);
        if (!e) {
          e = {
            apps: 0,
            topics: new Map(),
            last_ei: -1,
            first_ei: 10 ** 9,
            eds: new Set(),
            topic_apps: new Map(),
            topic_last: new Map(),
          };
          sstat.set(src, e);
        }
        e.apps += 1;
        e.topics.set(t.slug, t);
        e.last_ei = Math.max(e.last_ei, a.edition);
        e.first_ei = Math.min(e.first_ei, a.edition);
        e.eds.add(a.edition);
        e.topic_apps.set(t.slug, (e.topic_apps.get(t.slug) ?? 0) + 1);
        e.topic_last.set(
          t.slug,
          Math.max(e.topic_last.get(t.slug) ?? -1, a.edition),
        );
      }
    }
  }
  const SRC_FILES = new Map<string, string>();
  const usedSrc = new Set<string>(RESERVED_FILES);
  for (const src of sstat.keys()) {
    const base = "source-" + slugify(src, "src");
    let fn = base + ".html";
    let n = 2;
    while (usedSrc.has(fn)) {
      fn = `${base}-${n}.html`;
      n += 1;
    }
    usedSrc.add(fn);
    SRC_FILES.set(src, fn);
  }
  const srcHref = (src: string): string | null =>
    SRC_FILES.has(src) ? pyQuote(SRC_FILES.get(src) as string, "-._~") : null;
  const srcLink = (x: string): string => {
    const h = srcHref(x);
    return h ? `<a href="${h}">${esc(srcName(ctx, x))}</a>` : esc(srcName(ctx, x));
  };

  const lvlPairOf = (level: string | null | undefined): string => {
    const p =
      level != null && hasOwn(LEVELS, level) ? LEVELS[level] : LEVELS["echo"];
    // Emoji stays the LEVELS glyph; the label follows the build
    // language (identical to LEVELS' label for zh).
    return p[0] + levelLabel(ctx, level);
  };

  // topic pages
  for (const t of topics) {
    const last = t.apps[t.apps.length - 1];
    const locLast = locApp(ctx, last);
    const locName = locTopicName(ctx, t);
    const lastDisp: App = { ...last, rank_delta: last.board_rank_delta ?? null };
    const lvlPair =
      last.level != null && hasOwn(LEVELS, last.level)
        ? LEVELS[last.level]
        : LEVELS["echo"];
    const emoji = lvlPair[0];
    const label = levelLabel(ctx, last.level);
    const tUrl = `${ctx.baseUrl}${ctx.lang === "zh" ? "" : ctx.lang + "/"}${topicHref(t)}`;
    const share = shareLinks(
      ctx,
      tUrl,
      `${locName} · ${s(ctx, "wave")} ${last.heat}｜${s(ctx, "pg_title")}`,
    );
    let histRows = "";
    for (const a of t.apps) {
      let chg: string;
      if (a.heat_delta === null || a.heat_delta === undefined) {
        chg = s(ctx, "first");
      } else {
        const rd = a.board_rank_delta || 0;
        chg =
          `${s(ctx, "wave")} ${a.heat_delta > 0 ? "+" : ""}${a.heat_delta} · ` +
          `${s(ctx, "rank")} ${rd > 0 ? "▲" + rd : rd < 0 ? "▼" + -rd : "→"}`;
      }
      const srcTxt = a.sources
        .map((x) => srcLink(x))
        .join(ctx.lang === "en" ? ", " : "、");
      const lnk =
        a.links
          .map(
            (l) =>
              `<a href="${esc(l)}" rel="nofollow noopener" target="_blank">` +
              `${esc(urlNetloc(l) || s(ctx, "orig"))}</a>`,
          )
          .join(" · ") || "—";
      histRows +=
        `<tr><td>${edLabel(editions[a.edition])}</td><td class="n">${a.heat}</td>` +
        `<td class="n">#${a.board_rank}</td><td>${lvlPairOf(a.level)}</td>` +
        `<td>${chg}</td><td>${esc(locApp(ctx, a).title)}</td>` +
        `<td>${srcTxt}</td><td>${lnk}</td></tr>`;
    }
    const links = last.links;
    let det = "";
    if (links.length > 0) {
      const lis = links
        .map(
          (u) =>
            `<li><a href="${esc(u)}" rel="nofollow noopener">${esc(u)}</a></li>`,
        )
        .join("");
      det =
        `<div class="orig"><div class="note">${s(ctx, "orig_links")} (${links.length})</div>` +
        `<ul>${lis}</ul></div>`;
    }
    const bodyHtml = esc(locLast.body).replaceAll("\n", "<br>");
    const act = locLast.action
      ? `<p><b>${s(ctx, "action")}</b>：${esc(locLast.action)}</p>`
      : "";
    // creator reference v2: frameworks distilled from public writing
    // skills, filled with this topic's own data
    const hook = cpSlice(
      firstSentence((locLast.body || "").trim()),
      0,
      90,
    );
    const allSrcs = [...new Set(t.apps.flatMap((a) => a.sources))].sort(
      cpCompare,
    );
    const doms: string[] = [];
    for (const a of t.apps) {
      for (const u of a.links) {
        const d = urlNetloc(u);
        if (d && !doms.includes(d)) doms.push(d);
      }
    }
    const srcLine = doms.length > 0 ? doms.join(" · ") : "—";
    const dataLine =
      pyFormat(s(ctx, "wave_rank"), { h: last.heat, r: last.board_rank as number }) +
      " · " +
      pyFormat(s(ctx, "resonance"), { n: allSrcs.length });
    const ht = HOOK_T[ctx.lang];
    const hooks: [string, string][] = [
      [
        "hk_num",
        pyFormat(ht["num"], { name: locName, heat: last.heat, n: allSrcs.length }),
      ],
      ["hk_gap", pyFormat(ht["gap"], { hook })],
      [
        "hk_signal",
        pyFormat(ht["signal"], { name: locName, rank: last.board_rank as number }),
      ],
    ];
    const hooksOl =
      '<ol class="ol-list">' +
      hooks.map(([k, v]) => `<li><b>${s(ctx, k)}</b>：${esc(v)}</li>`).join("") +
      "</ol>";
    const pasOl =
      '<ol class="ol-list">' +
      `<li><b>${s(ctx, "pas_p")}</b>：${esc(hook)}</li>` +
      (locLast.action
        ? `<li><b>${s(ctx, "pas_a")}</b>：${esc(locLast.action)}</li>`
        : "") +
      `<li><b>${s(ctx, "pas_s")}</b>：${bodyHtml}<br>${dataLine} · ` +
      `${s(ctx, "ol_src")}：${esc(srcLine)}</li></ol>`;
    const traj = t.apps.map((a) => a.heat).join(" → ");
    const hzOl =
      '<ol class="ol-list">' +
      `<li><b>${s(ctx, "hz1")}</b>：${s(ctx, "hz1_hint")}</li>` +
      `<li><b>${s(ctx, "hz2")}</b>：${esc(locApp(ctx, t.apps[0]).title)} → ` +
      `${esc(locLast.title)}（${s(ctx, "traj")}：${traj}）</li>` +
      `<li><b>${s(ctx, "hz3")}</b>：${s(ctx, "hz3_hint")}</li>` +
      `<li><b>${s(ctx, "hz4")}</b>：${s(ctx, "hz4_txt")}</li></ol>`;
    const stUl = SHORT_TIPS[ctx.lang]
      .map((x) => `<li>${esc(x)}</li>`)
      .join("");
    const ltUl = LONG_TIPS[ctx.lang].map((x) => `<li>${esc(x)}</li>`).join("");
    const creator =
      `<section class="panel"><div class="panel-h"><span>${s(ctx, "creator_title")}</span>` +
      `<span class="r">${s(ctx, "cr_src")}</span></div>` +
      `<div class="subh">${s(ctx, "ol_short")}</div>` +
      `<div class="note" style="margin-top:8px">${s(ctx, "cr_hooks")}</div>${hooksOl}` +
      `<div class="note" style="margin-top:10px">${s(ctx, "cr_pas")}</div>${pasOl}` +
      `<div class="subh">${s(ctx, "tips_s")}</div><ul class="tips">${stUl}</ul>` +
      `<div class="subh">${s(ctx, "ol_long")}</div>` +
      `<div class="note" style="margin-top:8px">${s(ctx, "cr_hz")}</div>${hzOl}` +
      `<div class="subh">${s(ctx, "tips_l")}</div><ul class="tips">${ltUl}</ul></section>`;
    const ths = sArr(ctx, "th");
    const thead =
      `<th>${ths[0]}</th><th class="n">${ths[1]}</th><th class="n">${ths[2]}</th>` +
      ths.slice(3).map((x) => `<th>${x}</th>`).join("");
    const body =
      mast(ctx, "", editions, { fname: topicFile(t) }) +
      `<section class="panel"><div class="panel-h"><span>${esc(locName)}</span>` +
      `<span><a class="tag" href="${catFile(last.category)}">${esc(catName(ctx, last.category))}</a> ` +
      `<a class="badge" href="level-${last.level}.html">${emoji} ${label}</a></span></div>` +
      `<div style="display:flex;gap:26px;align-items:flex-end;padding:6px 0 2px">` +
      `<div><div class="big-heat">${last.heat}</div><div class="note">${s(ctx, "cur_wave")}</div></div>` +
      `<div><div style="font-family:var(--mono);font-size:26px;font-weight:700">#${last.board_rank}</div>` +
      `<div class="note">${s(ctx, "board_rank")} (${edLabel(editions[last.edition])})</div></div>` +
      `<div class="deltas">${deltaChips(ctx, lastDisp)}</div></div>` +
      `<div class="share"><span class="note">${s(ctx, "share")}</span>${share}</div>` +
      heatHelp(ctx) +
      `<h3 style="margin:26px 0 6px">${s(ctx, "chart")}</h3>${waveChart(ctx, t, editions)}` +
      `<table><tr>${thead}</tr>${histRows}</table>` +
      `<div class="detail" style="margin-top:24px"><p>${bodyHtml}</p>${act}` +
      `${det}</div></section>` +
      (ctx.creator ? creator : "") +
      foot(ctx);
    const ld: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: locLast.title,
      description: cpSlice(locLast.body || "", 0, 150),
      datePublished: t.apps[0].published ?? null,
      dateModified: last.published ?? null,
      author: { "@type": "Person", name: "Dai", url: "https://x.com/daiyanze" },
      publisher: {
        "@type": "Organization",
        name: s(ctx, "site_name"),
        url: ctx.baseUrl,
      },
      mainEntityOfPage: tUrl,
    };
    write(
      ctx,
      topicFile(t),
      page(ctx, locName, body, {
        desc: cpSlice(locLast.body || "", 0, 110),
        path: topicFile(t),
        ld,
      }),
    );
    write(
      ctx,
      `topic-${t.id}.html`,
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        `<meta http-equiv="refresh" content="0; url=${topicHref(t)}">` +
        `<link rel="canonical" href="${tUrl}"><meta name="robots" content="noindex">` +
        `<title>${esc(locName)}</title></head>` +
        `<body><a href="${topicHref(t)}">${esc(locName)}</a></body></html>`,
    );
  }

  // edition snapshots
  editions.forEach((ed, ei) => {
    const items = [...ed.items].sort((x, y) => (y._heat ?? 0) - (x._heat ?? 0));
    let erows = "";
    items.forEach((it, i) => {
      const pair = tmap.get(`${ei}\u0000${it.title}`) as [PubTopic, App];
      erows += rowHtml(ctx, i + 1, pair[0], pair[1], true);
    });
    const body =
      mast(ctx, "", editions, { fname: edFile(ed) }) +
      `<section class="panel"><div class="panel-h"><span>${pyFormat(s(ctx, "snap_title"), { x: edLabel(ed) })}</span>` +
      `<span class="r">${pyFormat(s(ctx, "count"), { n: items.length })}</span></div>` +
      erows +
      "</section>" +
      foot(ctx);
    write(
      ctx,
      edFile(ed),
      page(ctx, `${edLabel(ed)} · ${sArr(ctx, "tabs")[0]}`, body, {
        path: edFile(ed),
      }),
    );
  });

  const stateRow = (st: BoardState, rank?: number, showLevel = true): string => {
    const a: App = {
      ...st.app,
      heat_delta: st.heat_delta,
      rank_delta: st.rank_delta,
      carried: st.carried,
    };
    return rowHtml(ctx, rank !== undefined ? rank : st.rank, st.topic, a, showLevel);
  };

  // rising: 涨潮榜 — gain vs the previous board state; a topic new at
  // the latest point counts its full heat as the gain.
  const effGain = (st: BoardState): number =>
    st.heat_delta !== null ? st.heat_delta : st.app.heat;
  const rising = stsLatest.filter((st) => effGain(st) > 0);
  rising.sort((x, y) => effGain(y) - effGain(x));
  const rchunks =
    rising.length > 0
      ? rising.map((st, i) => stateRow(st, i + 1))
      : [`<p class="note">${s(ctx, "rising_empty")}</p>`];
  const rheader =
    `<div class="panel-h"><span>${s(ctx, "rising_title")}</span>` +
    `<span class="r">${edLabel(latest)} · ${pyFormat(s(ctx, "rising_r"), { n: rising.length })}</span></div>`;
  writePaged("rising.html", sArr(ctx, "tabs")[1], "rising", rheader, rchunks, PER, {
    desc: s(ctx, "desc_rising"),
    prefix: heatHelp(ctx),
  });

  // categories & levels: tag index page + one page per category / level
  const catOrder = [...ctx.catRules.rules.map(([c]) => c), ctx.catRules.fallback];
  const catSts = new Map<string, BoardState[]>();
  for (const cat of catOrder) {
    catSts.set(cat, stsLatest.filter((st) => st.app.category === cat));
  }
  const lvSts = new Map<string, BoardState[]>();
  for (const lv of ["must", "watch", "echo"]) {
    lvSts.set(lv, stsLatest.filter((st) => st.app.level === lv));
  }
  const tagIndex = (active?: string): string => {
    let chips = "";
    for (const cat of catOrder) {
      const sts = catSts.get(cat) as BoardState[];
      if (sts.length === 0) continue;
      chips +=
        `<a class="tagchip${active === `cat:${cat}` ? " on" : ""}" href="${catFile(cat)}">` +
        `${esc(catName(ctx, cat))} · ${sts.length}</a>`;
    }
    for (const lv of ["must", "watch", "echo"]) {
      const sts = lvSts.get(lv) as BoardState[];
      if (sts.length === 0) continue;
      chips +=
        `<a class="tagchip${active === `lv:${lv}` ? " on" : ""}" href="level-${lv}.html">` +
        `${LEVELS[lv][0]}${levelLabel(ctx, lv)} · ${sts.length}</a>`;
    }
    return (
      `<section class="panel"><div class="panel-h"><span>${s(ctx, "tags_title")}</span></div>` +
      `<div class="tagchips">${chips}</div></section>`
    );
  };
  let catSections = "";
  for (const cat of catOrder) {
    const sts = catSts.get(cat) as BoardState[];
    if (sts.length === 0) continue;
    const crows = sts.map((st) => stateRow(st)).join("");
    catSections +=
      `<section class="panel"><div class="panel-h"><span><a href="${catFile(cat)}">${esc(catName(ctx, cat))}</a></span>` +
      `<span class="r">${pyFormat(s(ctx, "cat_r"), { n: sts.length })}</span></div>${crows}</section>`;
    const cheader =
      `<div class="panel-h"><span>${esc(catName(ctx, cat))}</span>` +
      `<span class="r">${pyFormat(s(ctx, "cat_r"), { n: sts.length })}</span></div>`;
    writePaged(catFile(cat), catName(ctx, cat), "categories", cheader,
      sts.map((st) => stateRow(st)), PER, { prefix: tagIndex(`cat:${cat}`) });
  }
  for (const lv of ["must", "watch", "echo"]) {
    const sts = lvSts.get(lv) as BoardState[];
    if (sts.length === 0) continue;
    const ltitle = `${LEVELS[lv][0]} ${levelLabel(ctx, lv)}`;
    const lheader =
      `<div class="panel-h"><span>${ltitle}</span>` +
      `<span class="r">${pyFormat(s(ctx, "cat_r"), { n: sts.length })}</span></div>`;
    writePaged(`level-${lv}.html`, ltitle, "categories", lheader,
      sts.map((st) => stateRow(st)), PER, { prefix: tagIndex(`lv:${lv}`) });
  }
  write(
    ctx,
    "categories.html",
    page(
      ctx,
      sArr(ctx, "tabs")[4],
      mast(ctx, "categories", editions, { fname: "categories.html" }) +
        tagIndex() +
        catSections +
        foot(ctx),
      { path: "categories.html" },
    ),
  );

  // archive: grouped by date; editions within a date ordered by time
  const byDate = new Map<string, Edition[]>();
  for (const ed of editions) {
    const arr = byDate.get(ed.date);
    if (arr) arr.push(ed);
    else byDate.set(ed.date, [ed]);
  }
  const dateBlocks: string[] = [];
  for (const date of [...byDate.keys()].sort(cpCompare).reverse()) {
    const eds = [...(byDate.get(date) as Edition[])].sort((a, b) =>
      cpCompare(b.published_at ?? "", a.published_at ?? ""),
    );
    let block =
      `<div class="panel-h" style="margin-top:16px"><span>${date}</span>` +
      `<span class="r">${pyFormat(s(ctx, "editions_n"), { n: eds.length })}</span></div>`;
    for (const ed of eds) {
      let top = ed.items[0];
      for (const it of ed.items) {
        if ((it._heat ?? 0) > (top._heat ?? 0)) top = it;
      }
      const tim = cpSlice(ed.published_at ?? "", 11, 16);
      const slotLabel =
        ed.slot != null && hasOwn(SLOT_LABEL_I18N, ed.slot)
          ? SLOT_LABEL_I18N[ed.slot][ctx.lang] || SLOT[ed.slot][0]
          : ed.slot != null && hasOwn(SLOT, ed.slot)
            ? SLOT[ed.slot][0]
            : (ed.slot ?? "");
      block +=
        `<div class="row"><span class="time">${tim}</span>` +
        `<span class="rtitle"><a href="${edFile(ed)}">` +
        `${slotLabel} · ${esc(locEditionTitle(ctx, ed))}</a></span>` +
        `<span class="note">${pyFormat(s(ctx, "archive_row"), { n: ed.items.length })}${esc(cpSlice(top.i18n?.[ctx.lang]?.title || top.title || "", 0, 30))}</span>` +
        `<span class="heat"><span class="hv"><b>${top._heat}</b> <span>${s(ctx, "wave")}</span></span></span></div>`;
    }
    dateBlocks.push(block);
  }
  const aheader =
    `<div class="panel-h"><span>${s(ctx, "archive_title")}</span>` +
    `<span class="r">${pyFormat(s(ctx, "archive_r"), { n: editions.length })}</span></div>`;
  writePaged("archive.html", sArr(ctx, "tabs")[7], "archive", aheader,
    dateBlocks, ctx.archiveDays);

  // sources list (sstat was computed before the topic pages)
  const blocks = loadConfigBlocks(ctx);
  const sortedSstat = [...sstat.entries()].sort(
    (a, b) => b[1].apps - a[1].apps || cpCompare(a[0], b[0]),
  );
  const srcIcon = (src: string): string => {
    const dom = hasOwn(SOURCE_DOMAINS, src) ? SOURCE_DOMAINS[src] : undefined;
    if (dom && ctx.favFiles.has(dom)) {
      return `<img class="avimg src-ic" src="favicons/${ctx.favFiles.get(dom)}" alt="">`;
    }
    const hue = sumOrd(src) % 360;
    return (
      `<span class="av src-ic" style="background:hsl(${hue} 65% 72%);margin-left:0">` +
      `${esc(firstAlnum(srcName(ctx, src)))}</span>`
    );
  };
  const srcStats = (src: string, e: SourceStat): string =>
    pyFormat(s(ctx, "src_stats"), {
      dom:
        (hasOwn(SOURCE_DOMAINS, src) ? SOURCE_DOMAINS[src] : undefined) || "—",
      a: e.topics.size,
      b: e.apps,
      c: e.eds.size,
      d: edLabel(editions[e.first_ei]),
      e: edLabel(editions[e.last_ei]),
    });
  const schunks: string[] = [];
  for (const [src, e] of sortedSstat) {
    const dom = hasOwn(SOURCE_DOMAINS, src) ? SOURCE_DOMAINS[src] : undefined;
    const icon = srcIcon(src);
    const nameHtml =
      `<a href="${srcHref(src)}">${esc(srcName(ctx, src))}</a>` +
      (dom ? ` <a href="https://${dom}" rel="noopener" class="note">↗</a>` : "");
    const tops = [...e.topics.values()].sort(
      (x, y) =>
        y.apps[y.apps.length - 1].heat - x.apps[x.apps.length - 1].heat,
    );
    const tlinks = tops
      .map(
        (x) =>
          `<a href="${topicHref(x)}">${esc(cpSlice(locTopicName(ctx, x), 0, 22))}</a>`,
      )
      .join(" · ");
    const stats = srcStats(src, e);
    const blk = sourceBlock(src, blocks);
    const cfgHtml = blk
      ? `<details class="cfgdet"><summary>⚙️ config · ${sourceKey(src)}</summary>` +
        `<pre class="cfgpre">${esc(blk)}</pre></details>`
      : "";
    schunks.push(
      `<div class="row">${icon}` +
        `<span class="rtitle">${nameHtml}</span>` +
        `<span class="note">${esc(stats)}</span></div>` +
        cfgHtml +
        `<div class="srctops" style="padding:0 0 10px 43px">${tlinks}</div>`,
    );
  }
  const srcheader =
    `<div class="panel-h"><span>${s(ctx, "sources_title")}</span>` +
    `<span class="r">${pyFormat(s(ctx, "sources_r"), { n: sstat.size })}</span></div>`;
  writePaged("sources.html", sArr(ctx, "tabs")[5], "sources", srcheader,
    schunks, ctx.sourcesPer, { desc: s(ctx, "desc_sources") });

  // one detail page per source: stats, verbatim config, contributed topics
  for (const [src, e] of sortedSstat) {
    const dom = hasOwn(SOURCE_DOMAINS, src) ? SOURCE_DOMAINS[src] : undefined;
    const icon = srcIcon(src);
    const stats = srcStats(src, e);
    const topsSorted = [...e.topics.values()].sort(
      (x, y) =>
        y.apps[y.apps.length - 1].heat - x.apps[x.apps.length - 1].heat,
    );
    let trows = "";
    topsSorted.forEach((x, i) => {
      const xa = x.apps[x.apps.length - 1];
      trows +=
        `<div class="row"><span class="rank">${i + 1}</span>` +
        `<span class="rtitle"><a href="${topicHref(x)}">${esc(locTopicName(ctx, x))}</a></span>` +
        `<a class="tag" href="${catFile(xa.category)}">${esc(catName(ctx, xa.category))}</a>` +
        `<span class="note">${pyFormat(s(ctx, "src_topic_meta"), { n: e.topic_apps.get(x.slug) as number, d: edLabel(editions[e.topic_last.get(x.slug) as number]) })}</span>` +
        `<span class="heat"><span class="hv"><b>${xa.heat}</b> <span>${s(ctx, "wave")}</span></span></span></div>`;
    });
    const blk = sourceBlock(src, blocks);
    const cfgPanel = blk
      ? `<section class="panel"><div class="panel-h"><span>${s(ctx, "cfg_title")}</span></div>` +
        `<pre class="cfgpre full">${esc(blk)}</pre></section>`
      : "";
    const srcFile = SRC_FILES.get(src) as string;
    const dbody =
      mast(ctx, "sources", editions, { fname: srcFile }) +
      `<section class="panel"><div class="panel-h"><span>${icon} ${esc(srcName(ctx, src))}</span>` +
      (dom
        ? `<span><a href="https://${dom}" rel="noopener">${esc(dom)} ↗</a></span>`
        : "") +
      `</div><p class="note">${esc(stats)}</p></section>` +
      cfgPanel +
      `<section class="panel"><div class="panel-h"><span>${s(ctx, "src_topics_title")}</span>` +
      `<span class="r">${pyFormat(s(ctx, "count"), { n: topsSorted.length })}</span></div>` +
      trows +
      "</section>" +
      foot(ctx);
    write(ctx, srcFile, page(ctx, srcName(ctx, src), dbody, { path: srcFile, desc: stats }));
  }

  // about: site explanation (the old footer text lives here now)
  const aboutLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `${sArr(ctx, "tabs")[8]} · ${s(ctx, "site_name")}`,
    url: `${ctx.baseUrl}${ctx.lang === "zh" ? "" : ctx.lang + "/"}about.html`,
    author: { "@type": "Person", name: "Dai", url: "https://x.com/daiyanze" },
  };
  write(
    ctx,
    "about.html",
    page(
      ctx,
      sArr(ctx, "tabs")[8],
      mast(ctx, "about", editions, { fname: "about.html" }) +
        ABOUT[ctx.lang] +
        foot(ctx),
      { path: "about.html", desc: s(ctx, "desc_about"), ld: aboutLd },
    ),
  );

  // (The usage docs are NOT part of this build: since the domain split
  // they are a standalone site — buildDocsSite / the CLI's docs command —
  // and the nav's Docs tab links out to ctx.docsUrl.)

  // track record: generated from track-record.md at build time
  const tr = parseTrackRecordFile(
    ctx.trackRecordPath ?? path.join(ctx.rootDir, "track-record.md"),
  );
  let trSummary: string;
  if (tr.reviewed) {
    const rate = (tr.hits / tr.reviewed) * 100;
    trSummary =
      `${s(ctx, "tr_reviewed")} ${tr.reviewed} · ` +
      `${s(ctx, "tr_hit_rate")} ${pyFixed(rate, 0)}%`;
  } else {
    trSummary = pyFormat(s(ctx, "tr_first_review"), { d: tr.first_review });
  }
  let trGroups = "";
  for (const g of tr.groups) {
    let rows = "";
    for (const en of g.entries) {
      const lv = levelLabel(ctx, en.level);
      const res = en.result ? esc(en.result) : s(ctx, "tr_pending");
      rows +=
        `<tr class="tr-row"><td>${en.emoji} ${lv}</td>` +
        `<td>${esc(en.topic)}</td>` +
        `<td>${esc(en.criteria)}</td>` +
        `<td class="n">${en.review_date}</td><td>${res}</td></tr>`;
    }
    const ths = sArr(ctx, "tr_th");
    const thead = ths.map((x) => `<th>${x}</th>`).join("");
    trGroups +=
      `<section class="panel"><div class="panel-h">` +
      `<span>${g.date} ${esc(g.label)}</span>` +
      `<span class="r">${ths[3]} ${g.review_date}</span></div>` +
      `<table><tr>${thead}</tr>${rows}</table></section>`;
  }
  const trBody =
    mast(ctx, "track", editions, { fname: "track-record.html" }) +
    `<section class="panel"><div class="panel-h"><span>${s(ctx, "tr_title")}</span>` +
    `<span class="r">${s(ctx, "tr_total")} ${tr.total} · ` +
    `${s(ctx, "tr_reviewed")} ${tr.reviewed}</span></div>` +
    `<div class="detail"><p>${s(ctx, "tr_intro")}</p>` +
    `<p><b>${trSummary}</b></p>` +
    `<h3 style="margin:16px 0 6px">${s(ctx, "tr_criteria_t")}</h3>` +
    `${s(ctx, "tr_criteria")}</div></section>` +
    trGroups +
    foot(ctx);
  write(
    ctx,
    "track-record.html",
    page(ctx, sArr(ctx, "tabs")[6], trBody, {
      path: "track-record.html",
      desc: s(ctx, "desc_track"),
    }),
  );

  // submit an echo: GitHub Issue link with prefilled fields + bookmarklet
  const issueBody = pyQuote("标题：\n链接：\n理由：\n", "");
  const issueUrl =
    `https://github.com/${ctx.dataRepo}/issues/new` +
    `?template=echo.md&title=${pyQuote("🌀 投波：", "")}` +
    `&body=${issueBody}`;
  const submitAbs = `${ctx.baseUrl}${ctx.lang === "zh" ? "" : ctx.lang + "/"}submit.html`;
  const bookmarklet =
    "javascript:(function(){var t=document.title||'';" +
    `window.open('${submitAbs}?title='+encodeURIComponent(t)` +
    `+'&url='+encodeURIComponent(location.href),'_blank');})();`;
  const echoScript =
    "<script>(function(){var p=new URLSearchParams(location.search);" +
    "var t=p.get('title')||'',u=p.get('url')||'';" +
    "if(t||u){document.getElementById('echotext').value=" +
    "'标题：'+t+'\\n链接：'+u+'\\n理由：';}})();</script>";
  const subBody =
    mast(ctx, "submit", editions, { fname: "submit.html" }) +
    `<section class="panel"><div class="panel-h"><span>${s(ctx, "sub_title")}</span></div>` +
    `<div class="detail"><p>${s(ctx, "sub_intro")}</p>` +
    `<h3 style="margin:16px 0 6px">${s(ctx, "sub_good_t")}</h3>${s(ctx, "sub_good")}` +
    `<h3 style="margin:16px 0 6px">${s(ctx, "sub_issue_t")}</h3>` +
    `<p><a href="${issueUrl}" rel="noopener">${s(ctx, "sub_issue_btn")}</a></p>` +
    `<p>${s(ctx, "sub_issue_note")}</p>` +
    `<h3 style="margin:16px 0 6px">${s(ctx, "sub_bm_t")}</h3>` +
    `<p><a href="${esc(bookmarklet)}">${s(ctx, "sub_bm_btn")}</a></p>` +
    `<p>${s(ctx, "sub_bm_note")}</p>` +
    `<h3 style="margin:16px 0 6px">${s(ctx, "sub_prefill_t")}</h3>` +
    `<textarea id="echotext" rows="4" readonly ` +
    `style="width:100%;font-family:var(--mono);font-size:13px">` +
    `${s(ctx, "sub_form")}</textarea>` +
    `</div></section>` +
    foot(ctx) +
    echoScript;
  write(
    ctx,
    "submit.html",
    page(ctx, s(ctx, "sub_title"), subBody, {
      path: "submit.html",
      desc: s(ctx, "desc_submit"),
    }),
  );

  // RSS + Atom from the latest board (top 30 topics)
  const xesc = (t: string | null | undefined): string => esc(t || "");
  let itemsXml = "";
  let entriesXml = "";
  for (const st of stsLatest.slice(0, 30)) {
    const a = st.app;
    const t = st.topic;
    const link = `${ctx.baseUrl}${ctx.lang === "zh" ? "" : ctx.lang + "/"}${topicHref(t)}`;
    let pub = a.published ?? "";
    let rfc = "";
    const parsed = parseIso(pub);
    if (parsed !== null && pub !== "") {
      rfc = formatRfc2822(parsed);
    } else {
      rfc = "";
      pub = "";
    }
    const loc = locApp(ctx, a);
    const desc = xesc(cpSlice(loc.body || "", 0, 280));
    itemsXml +=
      `<item><title>${xesc(loc.title)}</title><link>${link}</link>` +
      `<guid>${link}</guid><pubDate>${rfc}</pubDate>` +
      `<description>${desc}</description></item>`;
    entriesXml +=
      `<entry><title>${xesc(loc.title)}</title>` +
      `<link href="${link}"/><id>${link}</id>` +
      `<updated>${pub}</updated><summary>${desc}</summary></entry>`;
  }
  let latestPub = "";
  for (const t of topics) {
    for (const a of t.apps) {
      const p = a.published ?? "";
      if (cpCompare(p, latestPub) > 0) latestPub = p;
    }
  }
  const rss =
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>` +
    `<title>${xesc(s(ctx, "site_name"))}</title><link>${ctx.baseUrl}${ctx.lang === "zh" ? "" : ctx.lang + "/"}</link>` +
    `<description>${xesc(s(ctx, "desc_default"))}</description>${itemsXml}</channel></rss>`;
  const atom =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom"><title>${xesc(s(ctx, "site_name"))}</title>` +
    `<link href="${ctx.baseUrl}${ctx.lang === "zh" ? "" : ctx.lang + "/"}"/><id>${ctx.baseUrl}${ctx.lang === "zh" ? "" : ctx.lang + "/"}</id>` +
    `<updated>${latestPub}</updated>${entriesXml}</feed>`;
  write(ctx, "feed.xml", rss);
  write(ctx, "atom.xml", atom);

  const pageCount = fs
    .readdirSync(OUT)
    .filter((n) => n.endsWith(".html")).length;
  const topHeat = Math.max(...latest.items.map((it) => it._heat ?? 0));
  console.log(
    `pages: ${pageCount} | topics: ${topics.length} | latest top heat: ${topHeat}`,
  );
}
