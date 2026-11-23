/**
 * Mastodon trending links (`mastodon`): links shared most on mastodon.social
 * today. `history` is newest day first, with counts as decimal strings.
 */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, count, isWebUrl, parseDate, parseJson, records } from "../parse.ts";

function link(l: Record<string, unknown>): SourceItem | null {
  const url = cleanText(l.url);
  const title = cleanText(l.title);
  if (!isWebUrl(url) || title === "") return null;
  const [today] = records(l.history);
  return { url, title, publishedAt: parseDate(l.published_at), heat: count(today?.uses) };
}

export const mastodon: Adapter = {
  groupId: "mastodon",
  format: "json",
  urls: () => ["https://mastodon.social/api/v1/trends/links?limit=20"],
  parse(body) {
    const data = parseJson(body);
    if (!Array.isArray(data)) throw new ParseError("mastodon: expected an array of links");
    return records(data)
      .map(link)
      .filter((i): i is SourceItem => i !== null);
  },
};
