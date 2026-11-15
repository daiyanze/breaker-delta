// Official blogs fetcher: lab/company RSS bundle (L1).
// Ported from radar/fetchers/official.py. All feeds together count
// as ONE source for resonance.

import { fetchFeedBundle } from "../common.js";
import type { FeedDef } from "../common.js";
import { asArray, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "official_blogs";
export const LAYER = 1;

export const DEFAULT_FEEDS: FeedDef[] = [
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml" },
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml" },
  { name: "Google Research", url: "https://research.google/blog/rss/" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml" },
  { name: "Mistral AI", url: "https://mistral.ai/news/rss" },
  { name: "NVIDIA Blog", url: "https://blogs.nvidia.com/feed/" },
  { name: "AWS Machine Learning", url: "https://aws.amazon.com/blogs/machine-learning/feed/" },
  { name: "GitHub Blog · AI & ML", url: "https://github.blog/ai-and-ml/feed/" },
  { name: "Microsoft Research", url: "https://www.microsoft.com/en-us/research/feed/" },
  { name: "BAIR", url: "https://bair.berkeley.edu/blog/feed.xml" },
  { name: "LangChain Blog", url: "https://blog.langchain.com/rss.xml" },
  { name: "Google Blog", url: "https://blog.google/rss/" },
  { name: "Ollama Blog", url: "https://ollama.com/blog/rss.xml" },
  { name: "Databricks Blog", url: "https://www.databricks.com/feed" },
  { name: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/" },
  { name: "GitHub Changelog", url: "https://github.blog/changelog/feed/" },
  { name: "Mozilla Blog", url: "https://blog.mozilla.org/en/feed/" },
];

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "official_blogs");
  const feeds = (cfg["feeds"] as FeedDef[] | undefined) ?? DEFAULT_FEEDS;
  void asArray;
  return fetchFeedBundle(SOURCE, LAYER, feeds, (cfg["per_feed"] as number | undefined) ?? 5);
};
