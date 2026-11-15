// Lobsters fetcher: hottest stories on lobste.rs (L2).
// Ported from radar/fetchers/lobsters.py.

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { g } from "../py.js";
import { asArray, asRecord } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "lobsters";
export const LAYER = 2;

export function parse(payload: unknown[]): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const raw of payload) {
    const story = asRecord(raw);
    if (!g(story, "title")) continue;
    items.push({
      source: SOURCE,
      name: String(g(story, "title")),
      url: (g(story, "url") as string | null) || (g(story, "comments_url", "") as string),
      metrics: {
        score: g(story, "score"),
        comments: g(story, "comment_count"),
        tags: g(story, "tags"),
      },
      detail: `Discussion: ${g(story, "comments_url", "")}`,
    });
  }
  return items;
}

export const fetch: FetcherFn = async () => {
  try {
    const payload = await getJson("https://lobste.rs/hottest.json");
    return ok(SOURCE, LAYER, parse(asArray(payload)));
  } catch (err) {
    if (err instanceof FetchError) return missing(SOURCE, LAYER, err.message);
    throw err;
  }
};
