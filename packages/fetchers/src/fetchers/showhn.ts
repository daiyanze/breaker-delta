// Show HN fetcher: launch posts on Hacker News (L1).
// Ported from radar/fetchers/showhn.py (same Algolia shape as the
// front-page fetcher, its own source).

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { g } from "../py.js";
import { asArray, asRecord } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "show_hn";
export const LAYER = 1;

export function parse(payload: Record<string, unknown>): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const raw of asArray(g(payload, "hits", []))) {
    const hit = asRecord(raw);
    if (!g(hit, "title")) continue;
    items.push({
      source: SOURCE,
      name: String(g(hit, "title")),
      url: (g(hit, "url") as string | null) ||
        `https://news.ycombinator.com/item?id=${g(hit, "objectID")}`,
      metrics: { points: g(hit, "points"), comments: g(hit, "num_comments") },
      detail: `HN discussion: https://news.ycombinator.com/item?id=${g(hit, "objectID")}`,
    });
  }
  return items;
}

export const fetch: FetcherFn = async () => {
  try {
    const payload = asRecord(
      await getJson("https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=30"),
    );
    return ok(SOURCE, LAYER, parse(payload));
  } catch (err) {
    if (err instanceof FetchError) return missing(SOURCE, LAYER, err.message);
    throw err;
  }
};
