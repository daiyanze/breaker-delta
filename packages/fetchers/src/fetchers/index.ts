// Fetcher registry. Order is the methodology's layer order — the
// same order as radar/fetchers/__init__.py's FETCHERS list (L1 source
// layer first, then L2 fermentation; X stays first).

import type { FetcherModule } from "./types.js";
import * as x from "./x.js";
import * as official from "./official.js";
import * as github from "./github.js";
import * as hackernews from "./hackernews.js";
import * as showhn from "./showhn.js";
import * as huggingface from "./huggingface.js";
import * as hfspaces from "./hfspaces.js";
import * as openrouter from "./openrouter.js";
import * as civitai from "./civitai.js";
import * as arxiv from "./arxiv.js";
import * as dailypapers from "./dailypapers.js";
import * as bluesky from "./bluesky.js";
import * as producthunt from "./producthunt.js";
import * as releases from "./releases.js";
import * as federalregister from "./federalregister.js";
import * as reddit from "./reddit.js";
import * as media from "./media.js";
import * as devto from "./devto.js";
import * as lobsters from "./lobsters.js";
import * as stackexchange from "./stackexchange.js";
import * as mastodon from "./mastodon.js";
import * as wikipedia from "./wikipedia.js";
import * as sitemaps from "./sitemaps.js";
import * as appstore from "./appstore.js";
import * as googlenews from "./googlenews.js";

export const FETCHERS: FetcherModule[] = [
  x, official, github, hackernews, showhn, huggingface, hfspaces,
  openrouter, civitai, arxiv, dailypapers, bluesky, producthunt,
  releases, federalregister,
  reddit, media, devto, lobsters, stackexchange, mastodon,
  wikipedia, sitemaps, appstore, googlenews,
];

export {
  x, official, github, hackernews, showhn, huggingface, hfspaces,
  openrouter, civitai, arxiv, dailypapers, bluesky, producthunt,
  releases, federalregister, reddit, media, devto, lobsters,
  stackexchange, mastodon, wikipedia, sitemaps, appstore, googlenews,
};
