import { catRulesFromConfig, DEFAULT_CAT_RULE_SET } from "@breaker-delta/core";

import {
  catKey,
  getSiteData,
  LANGS,
  sourceIndex,
} from "../../lib/data";
import { BASE_URL } from "../../lib/feeds";

// Sitemap over the web routes (the static build lists its .html
// files; the URL set is the same pages, route-shaped).
export async function GET() {
  const data = await getSiteData();
  const latest = data.editions[data.editions.length - 1];
  const defaultMod = (latest?.published_at ?? "").slice(0, 10);
  const modOf = new Map<string, string>();
  for (const t of data.topics) {
    const lastApp = t.apps[t.apps.length - 1];
    modOf.set(`topic/${t.slug}`, (lastApp.published ?? "").slice(0, 10) || defaultMod);
  }
  const rules = catRulesFromConfig(data.config) ?? DEFAULT_CAT_RULE_SET;
  const cats = [...rules.rules.map(([c]) => c), rules.fallback];
  const idx = sourceIndex(data);
  const urls: string[] = [];
  for (const lang of LANGS) {
    const prefix = lang === "zh" ? "" : `${lang}/`;
    const pages = [
      "",
      "rising",
      "echoes",
      "submit",
      "categories",
      "sources",
      "track-record",
      "archive",
      "about",
      "landing",
      ...cats.map((c) => `category/${catKey(c)}`),
      ...["must", "watch", "echo"].map((lv) => `level/${lv}`),
      ...[...idx.fileBase.values()],
      ...data.topics.map((t) => `topic/${t.slug}`),
      ...data.editions.map((ed) => `edition/${ed.date}-${ed.slot ?? "None"}`),
    ];
    for (const p of pages) {
      const mod = modOf.get(p) ?? defaultMod;
      urls.push(
        `<url><loc>${BASE_URL}${prefix}${encodeURI(p)}</loc><lastmod>${mod}</lastmod></url>`,
      );
    }
  }
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
