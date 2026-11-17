// Static prerender pilot (Rewrite Phase 3c): render the web
// app's page components into the static site's file layout,
// inside the same document shell the publisher's page() builds
// (head/meta/CSS/theme scripts), with web-scheme hrefs rewritten
// to static file hrefs. Pilot page: about (all three languages).
//
// Run: BD_DATA_DIR=<data> BD_ENGINE_DIR=<engine root> \
//      PRERENDER_OUT=<dir> node dist/prerender.mjs
// Equivalence gate: normalized comparison against the frozen
// golden build (visible text + link inventory per page).

import * as fs from "node:fs";
import * as path from "node:path";

import { CSS } from "@breaker-delta/publisher";
import { HTML_LANG, STRINGS, s, sArr } from "@breaker-delta/i18n";
import { renderToReadableStream } from "react-dom/server";

import AboutPage from "../app/[lang]/about/page";
import ArchivePage from "../app/[lang]/archive/page";
import LandingPage from "../app/[lang]/landing/page";
import TrackRecordPage from "../app/[lang]/track-record/page";

const LANGS = ["zh", "en", "ja"] as const;
type Lang = (typeof LANGS)[number];

const BASE_URL =
  process.env.BD_BASE_URL ?? "https://daiyanze.github.io/breaker-delta/";
const OUT = process.env.PRERENDER_OUT ?? "prerender-out";

const THEME_HEAD =
  '<script>try{var t=localStorage.getItem("ts-theme");' +
  'if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>';
const THEME_BIND =
  '<script>var tb=document.getElementById("themeBtn");if(tb){' +
  'tb.addEventListener("click",function(){var h=document.documentElement;' +
  'var n=h.getAttribute("data-theme")==="light"?"":"light";' +
  'if(n){h.setAttribute("data-theme",n)}else{h.removeAttribute("data-theme")}' +
  'try{localStorage.setItem("ts-theme",n)}catch(e){}})}</script>';

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Map a web-scheme href (/en/category/ai) to the static file
 *  path (en/category-ai.html), site-root relative. */
export function staticTarget(webHref: string): string | null {
  if (!webHref.startsWith("/")) return null;
  const seg = webHref.split("/").filter(Boolean);
  if (seg.length === 0) return "index.html";
  const [lang, ...rest] = seg;
  if (!(LANGS as readonly string[]).includes(lang)) return null;
  const prefix = lang === "zh" ? "" : `${lang}/`;
  if (rest.length === 0) return `${prefix}index.html`;
  const [head, tail] = rest;
  // File-like final segments (feed.xml, atom.xml, icons) map
  // onto themselves under the language prefix.
  if (head.includes(".")) return `${prefix}${rest.join("/")}`;
  if (head === "category" && tail) return `${prefix}category-${tail}.html`;
  if (head === "source" && tail) return `${prefix}source-${tail}.html`;
  if (head === "edition" && tail) return `${prefix}edition-${tail}.html`;
  if (head === "level" && tail) return `${prefix}level-${tail}.html`;
  if (head === "plugin" && tail) return `${prefix}plugin-${tail}.html`;
  if (head === "topic" && tail) return `${prefix}${tail}.html`;
  if (rest.length === 1) return `${prefix}${head}.html`;
  return null;
}

/** Relativize a site-root-relative target against the directory
 *  of the page being written ("" for zh root, "en"/"ja"). */
function relativize(target: string, fromDir: string): string {
  if (!fromDir) return target;
  if (target.startsWith(`${fromDir}/`)) return target.slice(fromDir.length + 1);
  return `../${target}`;
}

export function rewriteStaticHrefs(html: string, lang: Lang): string {
  const fromDir = lang === "zh" ? "" : lang;
  // Root-level files linked absolutely in the web scheme
  // (/feed.xml from the zh footer) relativize like any target.
  html = html.replace(/href="\/(feed\.xml|atom\.xml)"/g, (_m, f: string) =>
    `href="${fromDir ? `../${f}` : f}"`,
  );
  return html.replace(/href="(\/[^"]*)"/g, (m, href: string) => {
    const target = staticTarget(href);
    if (!target) return m;
    return `href="${relativize(target, fromDir)}"`;
  });
}

/** Body-only cleanup before the shell wraps it: the shell's
 *  <head> already declares the site icons, so the icon <link>
 *  the web Mast renders is dropped. */
export function cleanBody(html: string): string {
  return html.replace(/<link[^>]*icon-96[^>]*>/g, "");
}

/** The publisher page() shell, mirrored for prerendered pages. */
function shell(lang: Lang, pagePath: string, title: string, desc: string, ld: unknown, body: string): string {
  const url = `${BASE_URL}${lang === "zh" ? "" : `${lang}/`}${pagePath}`;
  let hreflang = "";
  for (const L of LANGS) {
    hreflang +=
      `<link rel="alternate" hreflang="${HTML_LANG[L]}" ` +
      `href="${BASE_URL}${L === "zh" ? "" : `${L}/`}${pagePath}">`;
  }
  hreflang += `<link rel="alternate" hreflang="x-default" href="${BASE_URL}${pagePath}">`;
  const ldHtml = ld
    ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>`
    : "";
  return (
    `<!DOCTYPE html>\n<html lang="${HTML_LANG[lang]}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="description" content="${esc(desc)}">` +
    `<link rel="canonical" href="${url}">${hreflang}` +
    `<link rel="icon" type="image/svg+xml" href="favicon.svg">` +
    `<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">` +
    `<link rel="apple-touch-icon" href="apple-touch-icon.png">` +
    `<link rel="alternate" type="application/rss+xml" title="${esc(s(lang, "site_name"))} RSS" href="feed.xml">` +
    `<link rel="alternate" type="application/atom+xml" title="${esc(s(lang, "site_name"))} Atom" href="atom.xml">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:site_name" content="${esc(s(lang, "site_name"))}">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(desc)}">` +
    `<meta property="og:url" content="${url}">` +
    `<meta property="og:image" content="${BASE_URL}og-image.png">` +
    `<meta name="twitter:image" content="${BASE_URL}og-image.png">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:site" content="@daiyanze">` +
    `<meta name="twitter:title" content="${esc(title)}">` +
    `<meta name="twitter:description" content="${esc(desc)}">` +
    `<title>${esc(title)} · Breaker Delta</title>${THEME_HEAD}<style>${CSS}</style>${ldHtml}</head>` +
    `<body>${body}${THEME_BIND}</body></html>`
  );
}

async function renderBody(element: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  return await new Response(stream).text();
}

interface PageDef {
  file: string;
  component: (props: { params: Promise<{ lang: string }> }) => Promise<React.ReactNode>;
  title: (lang: Lang) => string;
  descKey: string;
  ld?: (lang: Lang) => unknown;
}

const PAGES: PageDef[] = [
  {
    file: "about.html",
    component: AboutPage,
    title: (lang) => sArr(lang, "tabs")[8] ?? "About",
    descKey: "desc_about",
    ld: (lang) => ({
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: `${sArr(lang, "tabs")[8]} · ${s(lang, "site_name")}`,
      url: `${BASE_URL}${lang === "zh" ? "" : `${lang}/`}about.html`,
      author: { "@type": "Person", name: "Dai", url: "https://x.com/daiyanze" },
    }),
  },
  {
    file: "landing.html",
    component: LandingPage,
    title: (lang) => s(lang, "landing_title"),
    descKey: "desc_landing",
  },
  {
    // NOT YET GATED: the static archive links each date's
    // editions to the slot-collapsed edition-<date>-None.html
    // files (the recorded publisher artifact), while the web
    // links each edition by its real slot; the en rows also
    // differ in slot-label rendering. Archive switches together
    // with the edition pages, once the -None retirement is
    // decided — see REWRITE-DESIGN.md Phase 3 record.
    file: "archive.html",
    component: ArchivePage,
    title: (lang) => sArr(lang, "tabs")[7] ?? "Archive",
    descKey: "desc_default",
  },
  {
    file: "track-record.html",
    component: TrackRecordPage,
    title: (lang) => sArr(lang, "tabs")[6] ?? "Track record",
    descKey: "desc_track",
  },
];

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  for (const def of PAGES) {
    for (const lang of LANGS) {
      const body = await renderBody(
        <def.component params={Promise.resolve({ lang })} />,
      );
      const html = shell(
        lang,
        def.file,
        def.title(lang),
        s(lang, def.descKey),
        def.ld?.(lang) ?? null,
        rewriteStaticHrefs(cleanBody(body), lang),
      );
      const rel = lang === "zh" ? def.file : `${lang}/${def.file}`;
      fs.mkdirSync(path.join(OUT, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(OUT, rel), html);
      console.log("wrote", rel);
    }
  }
  void STRINGS;
}

await main();
