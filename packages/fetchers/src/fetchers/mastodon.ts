// Mastodon trends fetcher: trending links and tags (L2).
// Ported from radar/fetchers/mastodon.py.

import { FetchError, getJson, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { cpSlice, g, pyInt } from "../py.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn } from "./types.js";

export const SOURCE = "mastodon";
export const LAYER = 2;

function accounts(history: unknown[]): number | null {
  if (history.length === 0) return null;
  const first = asRecord(history[0]);
  return pyInt(g(first, "accounts", 0));
}

export function parseLinks(payload: unknown[]): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const raw of payload) {
    const link = asRecord(raw);
    if (!g(link, "title")) continue;
    items.push({
      source: SOURCE,
      name: String(g(link, "title")),
      url: (g(link, "url", "") as string) ?? "",
      metrics: {
        accounts_today: accounts(asArray(g(link, "history") ?? [])),
        provider: g(link, "provider_name"),
      },
      detail: cpSlice((g(link, "description") as string | null) || "", 0, 240),
    });
  }
  return items;
}

export function parseTags(payload: unknown[]): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const raw of payload) {
    const tag = asRecord(raw);
    if (!g(tag, "name")) continue;
    items.push({
      source: SOURCE,
      name: `#${String(g(tag, "name"))}`,
      url: (g(tag, "url", "") as string) ?? "",
      metrics: { accounts_today: accounts(asArray(g(tag, "history") ?? [])) },
      detail: "trending hashtag",
    });
  }
  return items;
}

export const fetch: FetcherFn = async (config) => {
  const cfg = sourceCfg(config, "mastodon");
  const instance = (cfg["instance"] as string | undefined) ?? "mastodon.social";
  const limit = cfg["limit"] ?? 20;
  const items: CandidateItem[] = [];
  let failed = 0;
  const kinds: [string, (p: unknown[]) => CandidateItem[]][] = [
    ["links", parseLinks],
    ["tags", parseTags],
  ];
  for (const [kind, parser] of kinds) {
    try {
      const payload = await getJson(
        `https://${instance}/api/v1/trends/${kind}?limit=${limit}`,
      );
      items.push(...parser(asArray(payload)));
    } catch (err) {
      if (err instanceof FetchError) {
        failed += 1;
      } else {
        throw err;
      }
    }
  }
  if (failed === 2) {
    return missing(SOURCE, LAYER, `trends API failed on ${instance}`);
  }
  return ok(SOURCE, LAYER, items, failed ? "one trends endpoint failed" : "");
};
