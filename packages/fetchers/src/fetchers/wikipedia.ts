// Wikipedia most-read fetcher: yesterday's top English articles (L2).
// Ported from radar/fetchers/wikipedia.py.

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { g } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "wikipedia";
export const LAYER = 2;

export const SKIP_PREFIXES = [
  "Special:", "Wikipedia:", "Help:", "File:", "Template:",
  "Portal:", "Main_Page", "Category:", "Talk:",
];

export function parse(payload: Record<string, unknown>, limit = 25): CandidateItem[] {
  const items: CandidateItem[] = [];
  const blocks = asArray(g(payload, "items") ?? []);
  if (blocks.length === 0) return items;
  const first = asRecord(blocks[0]);
  for (const raw of asArray(g(first, "articles", []))) {
    const article = asRecord(raw);
    const nameRaw = (g(article, "article") as string | null) || "";
    if (!nameRaw || SKIP_PREFIXES.some((p) => nameRaw.startsWith(p))) continue;
    const name = nameRaw.replace(/_/g, " ");
    items.push({
      source: SOURCE,
      name,
      url: `https://en.wikipedia.org/wiki/${nameRaw}`,
      metrics: { views: g(article, "views"), rank: g(article, "rank") },
      detail: "yesterday's most-read (en.wikipedia)",
    });
    if (items.length >= limit) break;
  }
  return items;
}

export const fetch: FetcherFn = async (config, now) => {
  const when = now ?? new Date();
  const limit = (sourceCfg(config, "wikipedia")["limit"] as number | undefined) ?? 25;
  const day = new Date(when.getTime() - 86_400_000);
  const y = day.getUTCFullYear();
  const m = String(day.getUTCMonth() + 1).padStart(2, "0");
  const d = String(day.getUTCDate()).padStart(2, "0");
  const url =
    "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/" +
    `en.wikipedia/all-access/${y}/${m}/${d}`;
  try {
    const payload = asRecord(await getJson(url));
    return ok(SOURCE, LAYER, parse(payload, limit));
  } catch (err) {
    if (err instanceof FetchError) return missing(SOURCE, LAYER, err.message);
    throw err;
  }
};
