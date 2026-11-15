// DEV (dev.to) fetcher: top developer articles (L2).
// Ported from radar/fetchers/devto.py.

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { g } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "devto";
export const LAYER = 2;

export function parse(payload: unknown[]): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const raw of payload) {
    const article = asRecord(raw);
    if (!g(article, "title")) continue;
    items.push({
      source: SOURCE,
      name: String(g(article, "title")),
      url: (g(article, "url", "") as string) ?? "",
      metrics: {
        reactions: g(article, "public_reactions_count"),
        comments: g(article, "comments_count"),
        reading_time: g(article, "reading_time_minutes"),
      },
      detail: (g(article, "description") as string | null) || "",
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "devto");
  const days = cfg["top_days"] ?? 1;
  const perPage = cfg["per_page"] ?? 30;
  try {
    const payload = await getJson(
      `https://dev.to/api/articles?top=${days}&per_page=${perPage}`,
    );
    return ok(SOURCE, LAYER, parse(asArray(payload)));
  } catch (err) {
    if (err instanceof FetchError) return missing(SOURCE, LAYER, err.message);
    throw err;
  }
};
