/**
 * Product Hunt public feed (`producthunt`): an Atom feed of launched
 * products. Each entry is dated by `published`, the launch; `updated` is
 * rewritten for every entry whenever the feed is regenerated, so it does not
 * date the product (L20). The feed has no vote counts.
 */
import type { Adapter } from "../adapter.ts";
import { parseFeed } from "../parse.ts";

export const productHunt: Adapter = {
  groupId: "producthunt",
  format: "xml",
  urls: () => ["https://www.producthunt.com/feed"],
  parse: (body) => parseFeed(body),
};
