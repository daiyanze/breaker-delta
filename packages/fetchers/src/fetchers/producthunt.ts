// Product Hunt fetcher. Ported from radar/fetchers/producthunt.py.
// With PRODUCTHUNT_TOKEN: GraphQL API. Without: the public Atom feed
// (titles/links only, no vote counts — noted in the result).

import { FetchError, getText, missing, ok, parseFeed, postJson, USER_AGENT } from "../common.js";
import type { CandidateItem } from "../common.js";
import { g } from "../py.js";
import { asArray, asRecord } from "./types.js";
import type { FetcherFn } from "./types.js";
import { XmlParseError } from "../xml.js";

export const SOURCE = "producthunt";
export const LAYER = 1;

export const QUERY = `
{ posts(first: 20, order: RANKING) {
    edges { node { name tagline url votesCount commentsCount } } } }
`;

export function parse(payload: Record<string, unknown>): CandidateItem[] {
  const items: CandidateItem[] = [];
  const data = asRecord(g(payload, "data", {}));
  const posts = asRecord(g(data, "posts", {}));
  for (const raw of asArray(g(posts, "edges", []))) {
    const edge = asRecord(raw);
    const node = asRecord(g(edge, "node", {}));
    items.push({
      source: SOURCE,
      name: (g(node, "name", "") as string) ?? "",
      url: (g(node, "url", "") as string) ?? "",
      metrics: { votes: g(node, "votesCount"), comments: g(node, "commentsCount") },
      detail: (g(node, "tagline") as string | null) || "",
    });
  }
  return items;
}

export function parseFeedPh(xmlText: string): CandidateItem[] {
  return parseFeed(xmlText, SOURCE, "Product Hunt", 30);
}
// Python names this parse_feed; keep the alias for parity callers.
export { parseFeedPh as parseFeed };

async function fetchFeedRoute(): Promise<ReturnType<typeof ok>> {
  try {
    const items = parseFeedPh(await getText("https://www.producthunt.com/feed"));
    if (items.length === 0) {
      return missing(SOURCE, LAYER, "Product Hunt feed returned no items");
    }
    return ok(SOURCE, LAYER, items, "via public Atom feed (no vote counts)");
  } catch (err) {
    if (err instanceof FetchError || err instanceof XmlParseError) {
      return missing(SOURCE, LAYER, `Product Hunt feed failed: ${err.message}`);
    }
    throw err;
  }
}

export const fetch: FetcherFn = async (_config, _now, opts) => {
  const env = opts?.env ?? process.env;
  const token = env["PRODUCTHUNT_TOKEN"];
  if (!token) return fetchFeedRoute();
  try {
    // Python builds this request by hand with urllib; postJson is
    // the shared equivalent (same UA, timeout and headers).
    const payload = asRecord(
      await postJson(
        "https://api.producthunt.com/v2/api/graphql",
        { query: QUERY },
        {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
      ),
    );
    return ok(SOURCE, LAYER, parse(payload));
  } catch (err) {
    return missing(
      SOURCE,
      LAYER,
      `Product Hunt API failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};
