// Stack Exchange fetcher: hot network questions (L2).
// Ported from radar/fetchers/stackexchange.py.

import { fetchFeedBundle } from "../common.js";
import type { FeedDef } from "../common.js";
import { sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "stackexchange";
export const LAYER = 2;

export const DEFAULT_FEEDS: FeedDef[] = [
  { name: "Stack Exchange · Hot Questions", url: "https://stackexchange.com/feeds/questions" },
];

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "stackexchange");
  const feeds = (cfg["feeds"] as FeedDef[] | undefined) ?? DEFAULT_FEEDS;
  return fetchFeedBundle(SOURCE, LAYER, feeds, (cfg["per_feed"] as number | undefined) ?? 20);
};
