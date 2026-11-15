// X fetcher, ported from radar/fetchers/x.py. No free official read
// API for trends: by default this source reports itself missing and
// the agent covers X by web scan. Set X_BEARER_TOKEN plus `accounts`
// in config to enable recent-search per account.

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { cpSlice, g, pyQuote } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "x";
export const LAYER = 1;

export function parse(payload: Record<string, unknown>): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const raw of asArray(g(payload, "data", []))) {
    const tweet = asRecord(raw);
    const metrics = asRecord(g(tweet, "public_metrics", {}));
    items.push({
      source: SOURCE,
      name: cpSlice(String(g(tweet, "text") ?? ""), 0, 120),
      url: `https://x.com/i/web/status/${g(tweet, "id")}`,
      metrics: { likes: g(metrics, "like_count") },
      detail: "",
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config, _now, opts) => {
  const env = opts?.env ?? process.env;
  const token = env["X_BEARER_TOKEN"];
  const accounts = asArray(sourceCfg(config, "x")["accounts"]);
  if (!token) {
    return missing(SOURCE, LAYER, "X_BEARER_TOKEN not set; covered by agent web scan");
  }
  if (accounts.length === 0) {
    return missing(SOURCE, LAYER, "no accounts configured in config x.accounts");
  }
  const items: CandidateItem[] = [];
  for (const account of accounts) {
    const query = pyQuote(`from:${String(account)}`);
    const url =
      `https://api.x.com/2/tweets/search/recent?query=${query}` +
      "&tweet.fields=public_metrics&max_results=10";
    try {
      const payload = asRecord(await getJson(url, { Authorization: `Bearer ${token}` }));
      items.push(...parse(payload));
    } catch (err) {
      if (err instanceof FetchError) continue;
      throw err;
    }
  }
  if (items.length === 0) {
    return missing(SOURCE, LAYER, "X API returned nothing for configured accounts");
  }
  return ok(SOURCE, LAYER, items);
};
