/**
 * GitHub releases watch list (`gh_releases`, one source): one Atom feed per
 * watched repository. A release's own title is often only a version
 * (`b7123`, `v0.11.0`), so the item's title is prefixed with the repository
 * the feed belongs to (`ggml-org/llama.cpp b7123`). Entries carry only
 * `updated`, which is the date used.
 *
 * Each repository is its own URL and its own `parse` call, so one feed that
 * fails does not stop the others from being read.
 */
import type { Adapter } from "../adapter.ts";
import { parseFeed } from "../parse.ts";

const FEED = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/releases\.atom$/;

export const githubReleases: Adapter = {
  groupId: "gh_releases",
  format: "xml",
  urls: (group) => group.members ?? [],
  parse(body, url) {
    const repo = FEED.exec(url)?.[1];
    const items = parseFeed(body);
    return repo ? items.map((i) => ({ ...i, title: `${repo} ${i.title}` })) : items;
  },
};
