/**
 * Bluesky key accounts (`bluesky`): a bundle of each account's public RSS
 * feed, counted as one source. Each member is its own URL and its own
 * `parse` call, so one account's feed failing does not affect the others.
 *
 * A post has no `<title>`: its text is the `<description>`, read as the
 * title. The item is the post's `bsky.app` page (`<link>`), not its
 * `at://` URI (`<guid isPermaLink="false">`). A post with no text (an
 * image only) is skipped. The feed has no like or repost counts.
 */
import type { Adapter } from "../adapter.ts";
import { parseFeed } from "../parse.ts";

export const bluesky: Adapter = {
  groupId: "bluesky",
  format: "xml",
  urls: (group) => group.members ?? [],
  parse: (body) => parseFeed(body, { titleFallback: "description" }),
};
