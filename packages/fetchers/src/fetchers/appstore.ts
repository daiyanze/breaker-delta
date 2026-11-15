// App Store charts fetcher: top-grossing and top-free apps (L2).
// Ported from radar/fetchers/appstore.py (marketing-tools JSON with
// the legacy iTunes RSS JSON as fallback per chart).

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { g } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "app_store";
export const LAYER = 2;

export function parse(payload: Record<string, unknown>, chart: string): CandidateItem[] {
  const items: CandidateItem[] = [];
  const feed = asRecord(g(payload, "feed") ?? {});
  const results = asArray(g(feed, "results") ?? []);
  results.forEach((raw, idx) => {
    const app = asRecord(raw);
    if (!g(app, "name")) return;
    const genres = asArray(g(app, "genres") ?? []).map((gen) => g(asRecord(gen), "name"));
    items.push({
      source: SOURCE,
      name: String(g(app, "name")),
      url: (g(app, "url", "") as string) ?? "",
      metrics: {
        chart,
        rank: idx + 1,
        artist: g(app, "artistName"),
        genres,
      },
      detail: "",
    });
  });
  return items;
}

export const LEGACY_CHARTS: Record<string, string> = {
  "top-grossing": "topgrossingapplications",
  "top-free": "topfreeapplications",
};

export function parseLegacy(payload: Record<string, unknown>, chart: string): CandidateItem[] {
  const items: CandidateItem[] = [];
  const feed = asRecord(g(payload, "feed") ?? {});
  const entries = asArray(g(feed, "entry") ?? []);
  entries.forEach((raw, idx) => {
    const app = asRecord(raw);
    const name = String(g(asRecord(g(app, "im:name") ?? {}), "label") ?? "").trim();
    if (!name) return;
    let link = "";
    for (const linkRaw of asArray(g(app, "link") ?? [])) {
      if (linkRaw !== null && typeof linkRaw === "object") {
        const attrs = asRecord(g(asRecord(linkRaw), "attributes") ?? {});
        link = (g(attrs, "href") as string | null) || link;
      }
    }
    const categoryAttrs = asRecord(g(asRecord(g(app, "category") ?? {}), "attributes") ?? {});
    const category = g(categoryAttrs, "label") as string | null;
    items.push({
      source: SOURCE,
      name,
      url: link,
      metrics: {
        chart,
        rank: idx + 1,
        artist: g(asRecord(g(app, "im:artist") ?? {}), "label"),
        genres: category ? [category] : [],
      },
      detail: "",
    });
  });
  return items;
}

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "app_store");
  const country = (cfg["country"] as string | undefined) ?? "us";
  const limit = cfg["limit"] ?? 25;
  const charts = asArray(cfg["charts"] ?? ["top-grossing", "top-free"]).map(String);
  const items: CandidateItem[] = [];
  const failed: string[] = [];
  const legacy: string[] = [];
  for (const chart of charts) {
    const url =
      `https://rss.marketingtools.apple.com/api/v2/${country}/apps/` +
      `${chart}/${limit}/apps.json`;
    try {
      const payload = asRecord(await getJson(url));
      items.push(...parse(payload, chart));
      continue;
    } catch (err) {
      if (!(err instanceof FetchError)) throw err;
    }
    const legacyName = LEGACY_CHARTS[chart];
    if (legacyName) {
      try {
        const payload = asRecord(
          await getJson(
            `https://itunes.apple.com/${country}/rss/${legacyName}/limit=${limit}/json`,
          ),
        );
        items.push(...parseLegacy(payload, chart));
        legacy.push(chart);
        continue;
      } catch (err) {
        if (!(err instanceof FetchError)) throw err;
      }
    }
    failed.push(chart);
  }
  if (items.length === 0) {
    return missing(SOURCE, LAYER, `all charts failed: ${failed.join(", ")}`);
  }
  const notes: string[] = [];
  if (legacy.length > 0) notes.push(`via legacy iTunes feed: ${legacy.join(", ")}`);
  if (failed.length > 0) notes.push(`failed charts: ${failed.join(", ")}`);
  return ok(SOURCE, LAYER, items, notes.join("; "));
};
