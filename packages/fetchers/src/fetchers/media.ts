// Tech media fetcher: media + independent-voice RSS bundle (L2).
// Ported from radar/fetchers/media.py. One story echoed by six
// outlets is still one source — the bundle counts once.

import { fetchFeedBundle } from "../common.js";
import type { FeedDef } from "../common.js";
import { sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "tech_media";
export const LAYER = 2;

export const DEFAULT_FEEDS: FeedDef[] = [
  { name: "TechCrunch · AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "The Verge · AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "Ars Technica · AI", url: "https://arstechnica.com/ai/feed/" },
  { name: "MIT Technology Review · AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { name: "The Decoder", url: "https://the-decoder.com/feed/" },
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/" },
  { name: "Import AI", url: "https://importai.substack.com/feed" },
  { name: "Latent Space", url: "https://www.latent.space/feed" },
  { name: "Interconnects", url: "https://www.interconnects.ai/feed" },
  { name: "Ahead of AI", url: "https://magazine.sebastianraschka.com/feed" },
  { name: "Dwarkesh Podcast", url: "https://www.dwarkesh.com/feed" },
  { name: "SemiAnalysis", url: "https://semianalysis.substack.com/feed" },
  { name: "One Useful Thing", url: "https://www.oneusefulthing.org/feed" },
  { name: "Platformer", url: "https://www.platformer.news/feed" },
  { name: "YC Blog", url: "https://www.ycombinator.com/blog/feed" },
  { name: "LessWrong", url: "https://www.lesswrong.com/feed.xml" },
];

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "tech_media");
  const feeds = (cfg["feeds"] as FeedDef[] | undefined) ?? DEFAULT_FEEDS;
  return fetchFeedBundle(SOURCE, LAYER, feeds, (cfg["per_feed"] as number | undefined) ?? 5);
};
