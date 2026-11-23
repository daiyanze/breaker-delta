/**
 * App Store charts (`app_store`): Apple's top free iPhone apps in the US,
 * from the marketing tools RSS API (JSON). A chart has no count, so heat is null.
 */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, isWebUrl, parseDate, parseJson, records } from "../parse.ts";

function app(a: Record<string, unknown>): SourceItem | null {
  const url = cleanText(a.url);
  const title = cleanText(a.name);
  if (!isWebUrl(url) || title === "") return null;
  // The app's first release, not the day it entered the chart.
  return { url, title, publishedAt: parseDate(a.releaseDate), heat: null };
}

export const appStore: Adapter = {
  groupId: "app_store",
  format: "json",
  urls: () => ["https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/25/apps.json"],
  parse(body) {
    const data = parseJson(body) as { feed?: { results?: unknown } } | null;
    const results = data?.feed?.results;
    if (!Array.isArray(results)) throw new ParseError("app_store: expected { feed: { results } }");
    return records(results)
      .map(app)
      .filter((i): i is SourceItem => i !== null);
  },
};
