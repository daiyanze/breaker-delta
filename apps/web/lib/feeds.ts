// RSS / Atom generation — the port of build.ts's feed section:
// latest board's top 30 topics, per language, with the same item
// fields. Dates: RSS wants RFC 2822 (Date.toUTCString), Atom keeps
// the stored ISO timestamps.

import { latestBoard, locApp, type Lang, type SiteData } from "./data";
import { s } from "./strings";

export const BASE_URL = process.env.BD_BASE_URL ?? "https://breakerdelta.com/";

function xesc(x: string): string {
  return x
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function langPrefix(lang: Lang): string {
  return lang === "zh" ? "" : `${lang}/`;
}

function feedParts(data: SiteData, lang: Lang): { items: string; entries: string } {
  let items = "";
  let entries = "";
  for (const st of latestBoard(data).slice(0, 30)) {
    const a = st.app;
    const t = st.topic;
    const link = `${BASE_URL}${langPrefix(lang)}topic/${encodeURIComponent(t.slug)}`;
    let pub = a.published ?? "";
    let rfc = "";
    const ms = Date.parse(pub);
    if (!Number.isNaN(ms) && pub !== "") {
      rfc = new Date(ms).toUTCString();
    } else {
      pub = "";
    }
    const loc = locApp(a, lang);
    const desc = xesc([...(loc.body || "")].slice(0, 280).join(""));
    items +=
      `<item><title>${xesc(loc.title)}</title><link>${link}</link>` +
      `<guid>${link}</guid><pubDate>${rfc}</pubDate>` +
      `<description>${desc}</description></item>`;
    entries +=
      `<entry><title>${xesc(loc.title)}</title>` +
      `<link href="${link}"/><id>${link}</id>` +
      `<updated>${pub}</updated><summary>${desc}</summary></entry>`;
  }
  return { items, entries };
}

export function rssFeed(data: SiteData, lang: Lang): string {
  const { items } = feedParts(data, lang);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>` +
    `<title>${xesc(s(lang, "site_name"))}</title><link>${BASE_URL}${langPrefix(lang)}</link>` +
    `<description>${xesc(s(lang, "desc_default"))}</description>${items}</channel></rss>`
  );
}

export function atomFeed(data: SiteData, lang: Lang): string {
  const { entries } = feedParts(data, lang);
  let latestPub = "";
  for (const t of data.topics) {
    for (const a of t.apps) {
      const p = a.published ?? "";
      if (p > latestPub) latestPub = p;
    }
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom"><title>${xesc(s(lang, "site_name"))}</title>` +
    `<link href="${BASE_URL}${langPrefix(lang)}"/><id>${BASE_URL}${langPrefix(lang)}</id>` +
    `<updated>${latestPub}</updated>${entries}</feed>`
  );
}
