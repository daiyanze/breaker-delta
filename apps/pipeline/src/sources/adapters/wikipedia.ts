/**
 * Wikipedia most read (`wikipedia`): English Wikipedia's most viewed articles
 * of the previous UTC day, from the Wikimedia pageviews API. Pages outside
 * the article namespace (`Special:Search`) and the main page are not items.
 */
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { cleanText, count, pageUrl, parseJson, records } from "../parse.ts";

const SITE = "https://en.wikipedia.org";
const DAY_MS = 86_400_000;

const NAMESPACE =
  /^(Special|Wikipedia|Project|File|Image|MediaWiki|Template|Help|Category|Portal|Draft|Module|TimedText|User|Talk|Media)(_talk)?:/i;
const NOT_ARTICLES = new Set(["Main_Page", "-"]);

function article(a: Record<string, unknown>, day: number | null): SourceItem | null {
  const name = cleanText(a.article);
  if (name === "" || NOT_ARTICLES.has(name) || NAMESPACE.test(name) || /^\w+_talk:/i.test(name)) {
    return null;
  }
  // Encoded as Wikipedia writes its own links: `/`, `:` and `,` stay as they
  // are (`AC/DC`, `Star_Wars:_Episode_IV`), `?`, `#`, `%` and the rest are escaped.
  const path = encodeURIComponent(name).replace(/%(2F|3A|2C)/g, (e) => decodeURIComponent(e));
  const url = pageUrl(SITE, `/wiki/${path}`);
  if (url === "") return null;
  return { url, title: name.replaceAll("_", " "), publishedAt: day, heat: count(a.views) };
}

export const wikipedia: Adapter = {
  groupId: "wikipedia",
  format: "json",
  urls(_group, now) {
    const [y, m, d] = new Date(now - DAY_MS).toISOString().slice(0, 10).split("-");
    return [
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${y}/${m}/${d}`,
    ];
  },
  parse(body) {
    const data = parseJson(body) as Record<string, unknown> | null;
    if (!Array.isArray(data?.items)) throw new ParseError("wikipedia: expected { items: [...] }");
    return records(data.items).flatMap((list) => {
      // The day the views were counted stands in for a publication date.
      const [y, m, d] = [list.year, list.month, list.day].map(count);
      const day = y && m && d ? Date.UTC(y, m - 1, d) : null;
      return records(list.articles)
        .map((a) => article(a, day))
        .filter((i): i is SourceItem => i !== null);
    });
  },
};
