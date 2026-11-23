/**
 * Hacker News front page and Show HN (`hackernews` group, one source): the
 * Algolia search API, one URL per member list.
 */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, count, isWebUrl, parseDate, parseJson, records } from "../parse.ts";

function hit(h: Record<string, unknown>): SourceItem | null {
  // Ask HN and text Show HN posts have no link; their discussion page is the item.
  const id = cleanText(h.objectID);
  const url =
    cleanText(h.url) || (/^\d+$/.test(id) ? `https://news.ycombinator.com/item?id=${id}` : "");
  const title = cleanText(h.title);
  if (!isWebUrl(url) || title === "") return null;
  return { url, title, publishedAt: parseDate(h.created_at), heat: count(h.points) };
}

export const hackernews: Adapter = {
  groupId: "hackernews",
  format: "json",
  urls: (group) => group.members ?? [],
  parse(body) {
    const data = parseJson(body) as Record<string, unknown> | null;
    if (!Array.isArray(data?.hits)) throw new ParseError("hackernews: expected { hits: [...] }");
    return records(data.hits)
      .map(hit)
      .filter((i): i is SourceItem => i !== null);
  },
};
