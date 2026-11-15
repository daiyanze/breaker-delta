// GitHub Releases watcher: flagship OSS release feeds (L1).
// Ported from radar/fetchers/releases.py. The feeds together count
// as ONE source for resonance.

import { fetchFeedBundle } from "../common.js";
import type { FeedDef } from "../common.js";
import { sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "gh_releases";
export const LAYER = 1;

export const DEFAULT_FEEDS: FeedDef[] = [
  { name: "llama.cpp Releases", url: "https://github.com/ggml-org/llama.cpp/releases.atom" },
  { name: "vLLM Releases", url: "https://github.com/vllm-project/vllm/releases.atom" },
  { name: "Claude Code Releases", url: "https://github.com/anthropics/claude-code/releases.atom" },
];

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "gh_releases");
  const feeds = (cfg["feeds"] as FeedDef[] | undefined) ?? DEFAULT_FEEDS;
  return fetchFeedBundle(SOURCE, LAYER, feeds, (cfg["per_feed"] as number | undefined) ?? 5);
};
