// Google News fetcher via its public RSS search feeds (L2 only).
// Ported from radar/fetchers/googlenews.py.

import { FetchError, getText, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { pyQuote } from "../py.js";
import { find, findText, iter, parseXml, XmlParseError } from "../xml.js";
import { asArray, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "google_news";
export const LAYER = 2;

export function parse(xmlText: string): CandidateItem[] {
  const items: CandidateItem[] = [];
  const root = parseXml(xmlText);
  for (const node of iter(root, "item")) {
    const title = findText(node, "title") ?? "";
    const link = findText(node, "link") ?? "";
    const sourceEl = find(node, "source");
    items.push({
      source: SOURCE,
      name: title,
      url: link,
      metrics: {
        outlet: sourceEl ? sourceEl.text : null,
        published: findText(node, "pubDate"),
      },
      detail: "",
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "google_news");
  const topics = asArray(cfg["topics"] ?? ["ai"]).map(String);
  const items: CandidateItem[] = [];
  let failed = 0;
  for (const topic of topics) {
    const url =
      `https://news.google.com/rss/search?q=${pyQuote(topic)}` +
      "&hl=en-US&gl=US&ceid=US:en";
    try {
      items.push(...parse(await getText(url)).slice(0, 20));
    } catch (err) {
      if (err instanceof FetchError || err instanceof XmlParseError) {
        failed += 1;
      } else {
        throw err;
      }
    }
  }
  if (failed === topics.length) {
    return missing(SOURCE, LAYER, "all Google News feeds failed");
  }
  return ok(SOURCE, LAYER, items, failed ? `${failed} feed(s) failed` : "");
};
