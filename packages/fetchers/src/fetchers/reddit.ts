// Reddit fetcher: public JSON per configured subreddit, with the
// public RSS feed as fallback. Ported from radar/fetchers/reddit.py.

import { FetchError, getJson, getText, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { g } from "../py.js";
import { find, findText, iter, parseXml, XmlParseError } from "../xml.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "reddit";
export const LAYER = 2;

const ATOM = "{http://www.w3.org/2005/Atom}";

export function parse(payload: Record<string, unknown>, subreddit: string): CandidateItem[] {
  const items: CandidateItem[] = [];
  const data = asRecord(g(payload, "data", {}));
  for (const raw of asArray(g(data, "children", []))) {
    const child = asRecord(raw);
    const post = asRecord(g(child, "data", {}));
    if (g(post, "stickied")) continue;
    items.push({
      source: SOURCE,
      name: (g(post, "title", "") as string) ?? "",
      url: `https://www.reddit.com${(g(post, "permalink", "") as string) ?? ""}`,
      metrics: {
        score: g(post, "score"),
        comments: g(post, "num_comments"),
        subreddit,
      },
      detail: "",
    });
  }
  return items;
}

export function parseRss(xmlText: string, subreddit: string): CandidateItem[] {
  const items: CandidateItem[] = [];
  const root = parseXml(xmlText);
  for (const entry of iter(root, `${ATOM}entry`)) {
    const title = findText(entry, `${ATOM}title`) ?? "";
    const linkEl = find(entry, `${ATOM}link`);
    items.push({
      source: SOURCE,
      name: title,
      // Python: link_el.get("href") — null when the attribute is
      // absent, "" only when there is no link element at all.
      url: (linkEl ? (linkEl.attrs["href"] ?? null) : "") as string,
      metrics: { score: null, comments: null, subreddit, via: "rss" },
      detail: "",
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config) => {
  const subs = asArray(sourceCfg(config, "reddit")["subreddits"] ?? []).map(String);
  const items: CandidateItem[] = [];
  const failed: string[] = [];
  const rssSubs: string[] = [];
  for (const sub of subs) {
    try {
      const payload = asRecord(
        await getJson(`https://www.reddit.com/r/${sub}/hot.json?limit=15`),
      );
      items.push(...parse(payload, sub));
      continue;
    } catch (err) {
      if (!(err instanceof FetchError)) throw err;
    }
    try {
      const text = await getText(`https://www.reddit.com/r/${sub}/hot/.rss?limit=15`);
      items.push(...parseRss(text, sub));
      rssSubs.push(sub);
    } catch (err) {
      if (err instanceof FetchError || err instanceof XmlParseError) {
        failed.push(sub);
      } else {
        throw err;
      }
    }
  }
  if (items.length === 0) {
    return missing(SOURCE, LAYER, `all subreddits failed: ${failed.join(", ")}`);
  }
  const notes: string[] = [];
  if (rssSubs.length > 0) notes.push(`via RSS (no scores): ${rssSubs.join(", ")}`);
  if (failed.length > 0) notes.push(`failed subreddits: ${failed.join(", ")}`);
  return ok(SOURCE, LAYER, items, notes.join("; "));
};
