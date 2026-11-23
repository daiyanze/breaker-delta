/** DEV.to top posts of the last day (`devto`): the public articles API. */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, count, isWebUrl, parseDate, parseJson, records } from "../parse.ts";

function article(a: Record<string, unknown>): SourceItem | null {
  const url = cleanText(a.url);
  const title = cleanText(a.title);
  if (!isWebUrl(url) || title === "") return null;
  return {
    url,
    title,
    publishedAt: parseDate(a.published_at),
    heat: count(a.public_reactions_count),
  };
}

export const devto: Adapter = {
  groupId: "devto",
  format: "json",
  urls: () => ["https://dev.to/api/articles?top=1&per_page=30"],
  parse(body) {
    const data = parseJson(body);
    if (!Array.isArray(data)) throw new ParseError("devto: expected an array of articles");
    return records(data)
      .map(article)
      .filter((i): i is SourceItem => i !== null);
  },
};
