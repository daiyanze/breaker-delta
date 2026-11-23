/**
 * Feed groups read as they are (M1-06): every member is an RSS 2.0, RSS 1.0
 * or Atom feed, and each item is the feed's own link, title and date.
 *
 * `official_blogs` and `tech_media` are bundles: each counts as one source
 * however many members report a story. Each member is its own URL and its
 * own `parse` call, so one member that fails (an error page, a feed that is
 * not XML) throws for that URL only and the other members are read as usual.
 */
import type { Adapter } from "../adapter.ts";
import { parseFeed } from "../parse.ts";

function feedGroup(groupId: string): Adapter {
  return {
    groupId,
    format: "xml",
    urls: (group) => group.members ?? [],
    parse: (body) => parseFeed(body),
  };
}

export const officialBlogs = feedGroup("official_blogs");
export const techMedia = feedGroup("tech_media");

/**
 * Google News, AI search (`google_news`). Item links are Google's own article
 * pages (`news.google.com/rss/articles/...`), not the publisher's URL, and
 * titles end with " - Publisher": both are kept as Google lists them.
 */
export const googleNews: Adapter = {
  groupId: "google_news",
  format: "xml",
  urls: () => ["https://news.google.com/rss/search?q=AI&hl=en-US&gl=US&ceid=US:en"],
  parse: (body) => parseFeed(body),
};
