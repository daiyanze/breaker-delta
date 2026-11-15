// Bluesky fetcher: configured accounts' public RSS feeds (L1).
// Ported from radar/fetchers/bluesky.py. Bluesky RSS items carry no
// <title>: the post text lives in <description>, so the first line
// becomes the candidate name.

import { FetchError, getText, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { cpSlice } from "../py.js";
import { findPath, findText, parseXml, XmlParseError } from "../xml.js";
import { asArray, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "bluesky";
export const LAYER = 1;

export const DEFAULT_ACCOUNTS = [
  "simonwillison.net",
  "karpathy.bsky.social",
  "gdb.bsky.social",
  "techcrunch.com",
  "theverge.com",
  "wired.com",
  "arstechnica.com",
];

export function parse(xmlText: string, handle: string, limit = 10): CandidateItem[] {
  const items: CandidateItem[] = [];
  const root = parseXml(xmlText);
  for (const node of findPath(root, "channel", "item")) {
    const link = (findText(node, "link") ?? "").trim();
    const text = (findText(node, "description") ?? "").replace(/\s+/g, " ").trim();
    if (!link || !text) continue;
    items.push({
      source: SOURCE,
      name: cpSlice(text, 0, 140),
      url: link,
      metrics: { account: handle, published: findText(node, "pubDate") },
      detail: cpSlice(text, 0, 240),
    });
    if (items.length >= limit) break;
  }
  return items;
}

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "bluesky");
  const accounts = asArray(cfg["accounts"] ?? DEFAULT_ACCOUNTS).map(String);
  const perAccount = (cfg["per_account"] as number | undefined) ?? 10;
  const items: CandidateItem[] = [];
  const failed: string[] = [];
  for (const handle of accounts) {
    try {
      const text = await getText(`https://bsky.app/profile/${handle}/rss`);
      items.push(...parse(text, handle, perAccount));
    } catch (err) {
      if (err instanceof FetchError || err instanceof XmlParseError) {
        failed.push(handle);
      } else {
        throw err;
      }
    }
  }
  if (items.length === 0) {
    return missing(SOURCE, LAYER, `all Bluesky feeds failed: ${failed.join(", ")}`);
  }
  const note = failed.length > 0 ? `failed accounts: ${failed.join(", ")}` : "";
  return ok(SOURCE, LAYER, items, note);
};
