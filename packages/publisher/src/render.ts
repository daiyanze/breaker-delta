// HTML rendering, ported function-by-function from radar/publish.py
// (mast, page, row_html, spark_svg, wave_chart, share_links, ...).
// Every template is reproduced character-for-character, including
// quirks like the trailing space in class="rank " and the always-
// Chinese level label in topic history tables.

import { slugify, topicFile, type Edition } from "@breaker-delta/core";

import { catName, levelLabel, langPrefix, s, sArr, type Ctx } from "./ctx.js";
import {
  ARC_NAMES,
  CAT_KEYS,
  CSS,
  HTML_LANG,
  LANG_LABEL,
  LEVELS,
  SHARE_ICONS,
  SHARE_PLATFORMS,
  SOURCE_DOMAINS,
  SRC_NAMES,
} from "./literals.js";
import {
  cpLen,
  cpSlice,
  esc,
  firstAlnum,
  parseIso,
  pyFixed,
  pyFormat,
  pyJsonDumps,
  pyQuote,
  sumOrd,
} from "./py.js";
import type { App, PubTopic } from "./types.js";

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

export function topicHref(t: { slug: string }): string {
  return pyQuote(topicFile(t), "-._~");
}

/** An appearance's agent-written text in the language being built.
 * Falls back field by field to the canonical main-language text when
 * a translation is missing, so partially translated data still builds. */
export interface LocText {
  title: string;
  body: string;
  action: string;
}

export function locApp(ctx: Ctx, app: App): LocText {
  const t = app.i18n?.[ctx.lang];
  return {
    title: t?.title || app.title,
    body: t?.body || app.body,
    action: t?.action || app.action,
  };
}

/** A topic's display name in the language being built: the arc-name
 * table for hard-coded arcs, else the translation of the appearance
 * whose title the canonical name came from (normally the latest). */
export function locTopicName(ctx: Ctx, topic: PubTopic): string {
  if (ctx.lang !== "zh") {
    const arc = ARC_NAMES[topic.name]?.[ctx.lang];
    if (arc) return arc;
  }
  const named = topic.apps.find((a) => a.title === topic.name);
  const last = topic.apps[topic.apps.length - 1];
  return locApp(ctx, named ?? last).title;
}

/** An edition's display title in the language being built. */
export function locEditionTitle(ctx: Ctx, ed: Edition): string {
  return ed.i18n?.[ctx.lang]?.title || ed.title || "";
}

/** A source's display name in the language being built. The stored
 * name stays the identity (favicon/domain/config lookups use it);
 * only the rendered text is localized. */
export function srcName(ctx: Ctx, name: string): string {
  if (ctx.lang === "zh") return name;
  return SRC_NAMES[name]?.[ctx.lang] || name;
}

export function catKey(cat: string): string {
  // Known categories keep their stable English keys. A category from
  // a custom preset taxonomy gets its own slugified key — mapping
  // every unknown category to "industry" (the pre-preset behaviour)
  // would make all custom categories share one page file.
  return hasOwn(CAT_KEYS, cat) ? CAT_KEYS[cat] : slugify(cat, "category");
}

export function catFile(cat: string): string {
  return `category-${catKey(cat)}.html`;
}

/** Conventional timestamp for an edition: YYYY-MM-DD HH:MM. */
export function edLabel(ed: Edition): string {
  const pa = ed.published_at ?? "";
  if (cpLen(pa) >= 16) return `${cpSlice(pa, 0, 10)} ${cpSlice(pa, 11, 16)}`;
  return ed.date;
}

export function edFile(ed: Edition): string {
  return `edition-${ed.date}-${ed.slot ?? "None"}.html`;
}

export function sparkSvg(points: number[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return (
      '<svg class="spark-svg" viewBox="0 0 64 26" width="64" height="26">' +
      '<circle cx="60" cy="13" r="2.6" fill="currentColor"/></svg>'
    );
  }
  const W = 64;
  const H = 26;
  const P = 3;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const rng = hi - lo || 1;
  const pts = points.map(
    (v, i) =>
      [
        P + (i * (W - 2 * P)) / (points.length - 1),
        H - P - ((v - lo) / rng) * (H - 2 * P),
      ] as const,
  );
  const line = pts.map(([x, y]) => `${pyFixed(x, 1)},${pyFixed(y, 1)}`).join(" ");
  const area =
    `M${pyFixed(pts[0][0], 1)},${H} ` +
    pts.map(([x, y]) => `L${pyFixed(x, 1)},${pyFixed(y, 1)}`).join(" ") +
    ` L${pyFixed(pts[pts.length - 1][0], 1)},${H} Z`;
  return (
    `<svg class="spark-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<path d="${area}" fill="currentColor" opacity=".16"/>` +
    `<polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.8" ` +
    `stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${pyFixed(pts[pts.length - 1][0], 1)}" cy="${pyFixed(pts[pts.length - 1][1], 1)}" r="2.6" fill="currentColor"/></svg>`
  );
}

/**
 * Wave points for the mini chart: appearances within 24h before the
 * row's appearance; falls back to the recent appearances when sparse.
 * Mirrors Python's try/except: any unparseable or naive/aware-mixed
 * timestamp discards the window entirely.
 */
export function trendPoints(topic: PubTopic, app: App): number[] {
  const apps = topic.apps.filter((a) => a.edition <= app.edition);
  try {
    const t1 = parseIso(app.published ?? "");
    if (t1 === null) throw new Error("fromisoformat failed");
    const win: App[] = [];
    for (const a of apps) {
      if (!a.published) continue;
      const t = parseIso(a.published);
      if (t === null) throw new Error("fromisoformat failed");
      if (t.aware !== t1.aware) throw new Error("naive/aware mix");
      if ((t1.ms - t.ms) / 1000 <= 86400) win.push(a);
    }
    if (win.length >= 2) return win.map((a) => a.heat);
  } catch {
    // fall through to the sparse fallback, like Python
  }
  return apps.slice(-6).map((a) => a.heat);
}

export function shareLinks(ctx: Ctx, url: string, text: string): string {
  const qUrl = pyQuote(url, "");
  const qText = pyQuote(text);
  let out = "";
  for (const key of ctx.shareKeys) {
    if (key === "copy") {
      out +=
        '<button class="sh" type="button" onclick="if(navigator.clipboard)' +
        "navigator.clipboard.writeText(location.href);this.lastChild.textContent='" +
        s(ctx, "copied") +
        '\'">' +
        SHARE_ICONS["copy"] +
        `<span>${s(ctx, "copy_link")}</span></button>`;
    } else if (hasOwn(SHARE_PLATFORMS, key)) {
      const [label, tpl] = SHARE_PLATFORMS[key];
      const href = pyFormat(tpl, { u: qUrl, t: qText });
      out +=
        `<a class="sh" href="${href}" target="_blank" rel="noopener">` +
        `${SHARE_ICONS[key] ?? ""}<span>${label}</span></a>`;
    }
  }
  return out;
}

export function faviconImg(): string {
  return '<img class="mastmark" src="icon-96.png" alt="">';
}

export interface MastOptions {
  currentEi?: number | null;
  fname?: string;
  tl?: boolean;
}

export function mast(
  ctx: Ctx,
  active: string,
  editions: Edition[],
  opts?: MastOptions,
): string {
  const fname = opts?.fname ?? "index.html";
  const currentEi = opts?.currentEi ?? null;
  const tl = opts?.tl ?? false;
  const hrefs = [
    "index.html", "rising.html", "echoes.html", "submit.html", "categories.html",
    "sources.html", "track-record.html", "archive.html", "about.html", "docs.html",
  ];
  const keys = [
    "index", "rising", "echoes", "submit", "categories", "sources", "track", "archive", "about", "docs",
  ];
  const tabs = sArr(ctx, "tabs");
  let tabHtml = "";
  hrefs.forEach((h, i) => {
    // The docs live on their own site (docs.breakerdelta.com): the tab
    // links out instead of to a page inside this build.
    const href = keys[i] === "docs" ? `${ctx.docsUrl}${langPrefix(ctx)}docs.html` : h;
    tabHtml += `<a href="${href}" class="${keys[i] === active ? "on" : ""}">${tabs[i]}</a>`;
  });
  // Plugin pages (Plugin-P2) join the tab bar after the built-ins.
  for (const pg of ctx.pluginPages ?? []) {
    const label = pg.title[ctx.lang as "zh" | "en" | "ja"] ?? pg.title.zh ?? pg.slug;
    tabHtml += `<a href="plugin-${pg.slug}.html" class="${active === `plugin:${pg.id}` ? "on" : ""}">${esc(label)}</a>`;
  }
  let ctl =
    `<button class="theme-btn" id="themeBtn" type="button" title="${s(ctx, "theme")}">◐</button>`;
  if (ctx.langs.length > 2) {
    const root = ctx.lang === "zh" ? "" : "../";
    let links = "";
    for (const L of ctx.langs) {
      links +=
        `<a href="${root}${L === "zh" ? "" : L + "/"}${fname}" ` +
        `class="${L === ctx.lang ? "on" : ""}">${ctx.langLabels[L] ?? LANG_LABEL[L] ?? L}</a>`;
    }
    ctl += `<span class="langs">${links}</span>`;
  }
  let tlHtml = "";
  if (tl && editions.length > 0) {
    const n = editions.length;
    const step = Math.max(1, Math.ceil(n / 8));
    let ticks = "";
    editions.forEach((ed, i) => {
      const on = i === currentEi ? " on" : "";
      const dim = i % step !== 0 && i !== currentEi && i !== n - 1 ? " dim" : "";
      ticks +=
        `<span class="tick${on}${dim}"><a href="${edFile(ed)}" data-i="${i}">` +
        `${edLabel(ed)}</a></span>`;
    });
    tlHtml = `<div class="ticks-scroll"><div class="timeline tight">${ticks}</div></div>`;
  }
  return (
    `<header class="mast">${faviconImg()}<div><div class="wordmark">BREAKER DELTA</div>\n` +
    `<div class="pg-title">${s(ctx, "pg_title")}</div></div>` +
    `<div class="mast-ctl">${ctl}</div></header>\n` +
    `<nav class="tabs">${tabHtml}</nav>${tlHtml}`
  );
}

export function deltaChips(ctx: Ctx, app: App): string {
  if (app.heat_delta === null || app.heat_delta === undefined) {
    return `<span class="dchip new">${s(ctx, "new")}</span>`;
  }
  const hd = app.heat_delta;
  const rd = app.rank_delta as number;
  const hCls = hd > 0 ? "up" : hd < 0 ? "down" : "";
  const hTxt =
    hd !== 0
      ? `${s(ctx, "wave")} ${hd > 0 ? "+" : ""}${hd}`
      : `${s(ctx, "wave")} →0`;
  let rTxt: string;
  let rCls: string;
  if (rd > 0) {
    rTxt = `${s(ctx, "rank")} ▲${rd}`;
    rCls = "up";
  } else if (rd < 0) {
    rTxt = `${s(ctx, "rank")} ▼${-rd}`;
    rCls = "down";
  } else {
    rTxt = `${s(ctx, "rank")} →`;
    rCls = "";
  }
  return `<span class="dchip ${hCls}">${hTxt}</span><span class="dchip ${rCls}">${rTxt}</span>`;
}

export function avatarStack(ctx: Ctx, sources: string[]): string {
  let avs = "";
  for (const src of sources.slice(0, 4)) {
    const dom = hasOwn(SOURCE_DOMAINS, src) ? SOURCE_DOMAINS[src] : undefined;
    if (dom && ctx.favFiles.has(dom)) {
      avs +=
        `<img class="avimg" src="favicons/${ctx.favFiles.get(dom)}" ` +
        `alt="${esc(srcName(ctx, src))}" title="${esc(srcName(ctx, src))}" loading="lazy">`;
    } else {
      const hue = sumOrd(src) % 360;
      const initial = firstAlnum(srcName(ctx, src));
      avs +=
        `<span class="av" style="background:hsl(${hue} 65% 72%)" ` +
        `title="${esc(srcName(ctx, src))}">${esc(initial)}</span>`;
    }
  }
  const extra =
    sources.length > 4 ? `<span class="more-n">+${sources.length - 4}</span>` : "";
  return `<span class="avatars">${avs}${extra}</span>`;
}

export function tstamp(app: App): string {
  const p = app.published ?? "";
  if (cpLen(p) >= 16) return `${cpSlice(p, 5, 10)} ${cpSlice(p, 11, 16)}`;
  return cpSlice(app.date ?? "", 5);
}

export function rowHtml(
  ctx: Ctx,
  rank: number,
  topic: PubTopic,
  app: App,
  showLevel = false,
): string {
  const lvl =
    app.level != null && hasOwn(LEVELS, app.level)
      ? LEVELS[app.level]
      : LEVELS["echo"];
  const emoji = lvl[0];
  const badge = showLevel
    ? ` <a class="badge" href="level-${app.level}.html">${emoji}${levelLabel(ctx, app.level)}</a>`
    : "";
  const carried = app.carried
    ? ` <span class="note">${s(ctx, "carried")}</span>`
    : "";
  const tag = app.category
    ? `<a class="tag" href="${catFile(app.category)}">${esc(catName(ctx, app.category))}</a>`
    : "";
  const time = `<span class="time">${tstamp(app)}</span>`;
  const spark = sparkSvg(trendPoints(topic, app));
  const rd = app.rank_delta;
  let rdelta: string;
  let prank: string;
  if (rd === null || rd === undefined) {
    rdelta = `<span class="hdelta new">${s(ctx, "new")}</span>`;
    prank = "";
  } else if (rd > 0) {
    rdelta = `<span class="hdelta up">▲${rd}</span>`;
    prank = `<span class="prank">${s(ctx, "prev")} ${rank + rd}</span>`;
  } else if (rd < 0) {
    rdelta = `<span class="hdelta down">▼${-rd}</span>`;
    prank = `<span class="prank">${s(ctx, "prev")} ${rank + rd}</span>`;
  } else {
    rdelta = '<span class="hdelta">→</span>';
    prank = `<span class="prank">${s(ctx, "prev")} ${rank}</span>`;
  }
  const hd = app.heat_delta;
  let hdelta: string;
  if (hd === null || hd === undefined) {
    hdelta = `<span class="hdelta new">${s(ctx, "new")}</span>`;
  } else if (hd > 0) {
    hdelta = `<span class="hdelta up">▲${hd}</span>`;
  } else if (hd < 0) {
    hdelta = `<span class="hdelta down">▼${-hd}</span>`;
  } else {
    hdelta = '<span class="hdelta">→0</span>';
  }
  return (
    `<div class="row"><span class="rank ${rank <= 3 ? "top" : ""}">${rank}${rdelta}${prank}</span>\n` +
    `<span class="rtitle"><a href="${topicHref(topic)}">${esc(locApp(ctx, app).title)}</a>${badge}${carried}</span>\n` +
    `${tag}${time}\n` +
    `${avatarStack(ctx, app.sources)}\n` +
    `<span class="heat"><span class="spark">${spark}</span><span class="hv"><b>${app.heat}</b> <span>${s(ctx, "wave")}</span> ${hdelta}</span></span>${scoreChips(ctx, app)}</div>`
  );
}

/** Plugin-P1 sub-score chips: one pill per enabled score plugin
 *  that has a stored score on this appearance. The heat stays the
 *  one primary number; plugin scores ride alongside, labelled. */
export function scoreChips(ctx: Ctx, app: App): string {
  if (!ctx.scorePlugins || ctx.scorePlugins.length === 0) return "";
  const plugins = (app as { plugins?: Record<string, Record<string, unknown>> }).plugins;
  if (!plugins) return "";
  let out = "";
  for (const desc of ctx.scorePlugins) {
    const value = plugins[desc.id]?.score;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const label = desc.label[ctx.lang as "zh" | "en" | "ja"] ?? desc.label.zh ?? desc.id;
    out += `<span class="pscore" title="${esc(label)}">${esc(label)} ${value}</span>`;
  }
  return out;
}

/** Plugin-P2 entity chips: the entity names stored by enabled
 *  extraction plugins on this appearance. */
export function entityChips(ctx: Ctx, app: App): string {
  if (!ctx.entityPlugins || ctx.entityPlugins.length === 0) return "";
  const plugins = (app as { plugins?: Record<string, Record<string, unknown>> }).plugins;
  if (!plugins) return "";
  let out = "";
  for (const id of ctx.entityPlugins) {
    const entities = plugins[id]?.entities;
    if (!Array.isArray(entities)) continue;
    for (const e of entities as { type?: unknown; name?: unknown }[]) {
      if (typeof e?.name !== "string" || e.name === "") continue;
      out += `<span class="pscore" title="${esc(id)}">${esc(e.name)}</span>`;
    }
  }
  return out;
}

export interface PageOptions {
  desc?: string | null;
  path?: string;
  ld?: Record<string, unknown> | null;
}

const THEME_HEAD =
  '<script>try{var t=localStorage.getItem("ts-theme");' +
  'if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>';
const THEME_BIND =
  '<script>var tb=document.getElementById("themeBtn");if(tb){' +
  'tb.addEventListener("click",function(){var h=document.documentElement;' +
  'var n=h.getAttribute("data-theme")==="light"?"":"light";' +
  'if(n){h.setAttribute("data-theme",n)}else{h.removeAttribute("data-theme")}' +
  'try{localStorage.setItem("ts-theme",n)}catch(e){}})}</script>';

export function page(ctx: Ctx, title: string, body: string, opts?: PageOptions): string {
  const path = opts?.path ?? "index.html";
  const desc = opts?.desc ? opts.desc : s(ctx, "desc_default");
  const ld = opts?.ld ?? null;
  const url = ctx.baseUrl + langPrefix(ctx) + path;
  const otype = ld?.["@type"] === "NewsArticle" ? "article" : "website";
  const ogImg = ctx.ogImg
    ? `<meta property="og:image" content="${ctx.baseUrl}og-image.png">` +
      `<meta name="twitter:image" content="${ctx.baseUrl}og-image.png">`
    : "";
  const ldHtml = ld
    ? `<script type="application/ld+json">${pyJsonDumps(ld)}</script>`
    : "";
  let hreflang = "";
  for (const L of ctx.langs) {
    hreflang +=
      `<link rel="alternate" hreflang="${ctx.htmlLangs[L] ?? HTML_LANG[L] ?? L}" ` +
      `href="${ctx.baseUrl}${L === "zh" ? "" : L + "/"}${path}">`;
  }
  hreflang += `<link rel="alternate" hreflang="x-default" href="${ctx.baseUrl}${path}">`;
  return (
    `<!DOCTYPE html>\n<html lang="${ctx.htmlLangs[ctx.lang] ?? HTML_LANG[ctx.lang] ?? ctx.lang}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="description" content="${esc(desc)}">` +
    `<link rel="canonical" href="${url}">${hreflang}` +
    `<link rel="icon" type="image/svg+xml" href="favicon.svg">` +
    `<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">` +
    `<link rel="apple-touch-icon" href="apple-touch-icon.png">` +
    `<link rel="alternate" type="application/rss+xml" title="${esc(s(ctx, "site_name"))} RSS" href="feed.xml">` +
    `<link rel="alternate" type="application/atom+xml" title="${esc(s(ctx, "site_name"))} Atom" href="atom.xml">` +
    `<meta property="og:type" content="${otype}">` +
    `<meta property="og:site_name" content="${esc(s(ctx, "site_name"))}">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(desc)}">` +
    `<meta property="og:url" content="${url}">${ogImg}` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:site" content="@daiyanze">` +
    `<meta name="twitter:title" content="${esc(title)}">` +
    `<meta name="twitter:description" content="${esc(desc)}">` +
    `<title>${esc(title)} · Breaker Delta</title>${THEME_HEAD}<style>${CSS}</style>${ldHtml}</head>` +
    `<body><div class="wrap">${body}</div>${THEME_BIND}</body></html>`
  );
}

export function waveChart(ctx: Ctx, topic: PubTopic, editions: Edition[]): string {
  void ctx;
  const apps = topic.apps;
  const W = 1020;
  const H = 300;
  const L = 46;
  const R = 30;
  const T = 18;
  const B = 34;
  const iw = W - L - R;
  const ih = H - T - B;
  const vmax = Math.max(...apps.map((a) => a.heat)) * 1.15 || 1;
  const xs = new Map<number, number>();
  for (const a of apps) {
    xs.set(
      a.edition,
      L + (a.edition * iw * (2 / 3)) / Math.max(1, editions.length - 1),
    );
  }
  const y = (v: number): number => T + ih - (v / vmax) * ih;
  const out: string[] = [
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">`,
    '<defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#5eead4" stop-opacity=".38"/>' +
      '<stop offset="1" stop-color="#5eead4" stop-opacity=".03"/></linearGradient></defs>',
  ];
  for (const gv of [0, 0.25, 0.5, 0.75, 1.0]) {
    const v = vmax * gv;
    out.push(
      `<line x1="${L}" y1="${pyFixed(y(v), 0)}" x2="${W - R}" y2="${pyFixed(y(v), 0)}" stroke="rgba(255,255,255,.07)"/>` +
        `<text x="${L - 8}" y="${pyFixed(y(v) + 4, 0)}" fill="#5f7189" font-size="11" text-anchor="end">${pyFixed(v, 0)}</text>`,
    );
  }
  const pts = apps.map(
    (a) => [xs.get(a.edition) as number, y(a.heat)] as const,
  );
  if (pts.length >= 2) {
    const line = pts
      .map(([a, b]) => `${pyFixed(a, 0)},${pyFixed(b, 0)}`)
      .join(" ");
    const area =
      `M${pyFixed(pts[0][0], 0)},${pyFixed(y(0), 0)} ` +
      pts.map(([a, b]) => `L${pyFixed(a, 0)},${pyFixed(b, 0)}`).join(" ") +
      ` L${pyFixed(pts[pts.length - 1][0], 0)},${pyFixed(y(0), 0)} Z`;
    out.push(`<path d="${area}" fill="url(#wgrad)"/>`);
    out.push(
      `<polyline points="${line}" fill="none" stroke="#5eead4" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  }
  apps.forEach((a, i) => {
    const px = pts[i][0];
    const py = pts[i][1];
    out.push(
      `<a href="${edFile(editions[a.edition])}"><circle cx="${pyFixed(px, 0)}" cy="${pyFixed(py, 0)}" r="5" fill="#0a0e13" stroke="#5eead4" stroke-width="2.4"/></a>` +
        `<text x="${pyFixed(px, 0)}" y="${pyFixed(py - 12, 0)}" fill="#e8eef5" font-size="12.5" font-weight="700" text-anchor="middle">${a.heat}</text>` +
        `<text x="${pyFixed(px, 0)}" y="${H - 12}" fill="#5f7189" font-size="11" text-anchor="middle">${edLabel(editions[a.edition])}</text>`,
    );
  });
  out.push("</svg>");
  return out.join("");
}

export function foot(ctx: Ctx): string {
  return (
    `<footer><div class="copy">© 2026 Dai · <a href="about.html">${s(ctx, "foot_about")}</a> · <a href="${ctx.docsUrl}${langPrefix(ctx)}docs.html">${sArr(ctx, "tabs")[9]}</a> · ` +
    `<a href="https://github.com/daiyanze/breaker-delta" rel="noopener">GitHub</a> · ` +
    `<a href="https://x.com/daiyanze" rel="noopener">X</a> · ` +
    `<a href="feed.xml">RSS</a> · <a href="atom.xml">Atom</a></div></footer>`
  );
}

/**
 * Header for the standalone docs site: same brand block as mast(),
 * but the nav row is just "back to the radar" (absolute, mainUrl) plus
 * the docs hub tab; the docsNav chips carry intra-docs navigation.
 */
export function mastDocs(ctx: Ctx, fname: string): string {
  let ctl =
    `<button class="theme-btn" id="themeBtn" type="button" title="${s(ctx, "theme")}">◐</button>`;
  if (ctx.langs.length > 2) {
    const root = ctx.lang === "zh" ? "" : "../";
    let links = "";
    for (const L of ctx.langs) {
      links +=
        `<a href="${root}${L === "zh" ? "" : L + "/"}${fname}" ` +
        `class="${L === ctx.lang ? "on" : ""}">${ctx.langLabels[L] ?? LANG_LABEL[L] ?? L}</a>`;
    }
    ctl += `<span class="langs">${links}</span>`;
  }
  const tabs =
    `<a href="${ctx.mainUrl}${langPrefix(ctx)}index.html">${s(ctx, "docs_back")}</a>` +
    `<a href="docs.html" class="on">${sArr(ctx, "tabs")[9]}</a>`;
  return (
    `<header class="mast">${faviconImg()}<div><div class="wordmark">BREAKER DELTA</div>\n` +
    `<div class="pg-title">${s(ctx, "pg_title")}</div></div>` +
    `<div class="mast-ctl">${ctl}</div></header>\n` +
    `<nav class="tabs">${tabs}</nav>`
  );
}

/** Footer for the standalone docs site (no in-site relative links). */
export function footDocs(ctx: Ctx): string {
  return (
    `<footer><div class="copy">© 2026 Dai · <a href="${ctx.mainUrl}${langPrefix(ctx)}index.html">${s(ctx, "docs_back")}</a> · ` +
    `<a href="https://github.com/daiyanze/breaker-delta" rel="noopener">GitHub</a> · ` +
    `<a href="https://x.com/daiyanze" rel="noopener">X</a></div></footer>`
  );
}

/** Collapsible explainer: how 浪高 is calculated. */
export function heatHelp(ctx: Ctx): string {
  return (
    `<details class="help"><summary>${s(ctx, "heat_help_t")}</summary>` +
    `<div class="helpbody">${s(ctx, "heat_help")}</div></details>`
  );
}
