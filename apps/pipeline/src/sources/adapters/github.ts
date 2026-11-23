/**
 * GitHub breakout repositories (`github`): repositories created in the last
 * week, most starred first, from the search API. It reads without a token
 * (10 searches a minute; a scan makes one).
 */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, count, isWebUrl, parseDate, parseJson, records } from "../parse.ts";

/** How far back a repository counts as new. Part of the source's definition, like a feed URL. */
const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

function repo(r: Record<string, unknown>): SourceItem | null {
  const url = cleanText(r.html_url);
  const title = cleanText(r.full_name);
  if (!isWebUrl(url) || title === "") return null;
  return { url, title, publishedAt: parseDate(r.created_at), heat: count(r.stargazers_count) };
}

export const github: Adapter = {
  groupId: "github",
  format: "json",
  urls(_group, now) {
    const since = new Date(now - WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
    const q = encodeURIComponent(`created:>${since}`);
    return [`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=30`];
  },
  parse(body) {
    const data = parseJson(body) as Record<string, unknown> | null;
    if (!Array.isArray(data?.items)) throw new ParseError("github: expected { items: [...] }");
    return records(data.items)
      .map(repo)
      .filter((i): i is SourceItem => i !== null);
  },
};
