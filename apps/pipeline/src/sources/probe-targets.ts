import type { ProbeTarget } from "./probe.ts";

/**
 * STARTER LIST ONLY. These are example public endpoints, not the final set of
 * fetch groups. Before running spike 2, replace this with one representative
 * URL for every fetch group you intend to ship.
 */
export const PROBE_TARGETS: readonly ProbeTarget[] = [
  { groupId: "hackernews", url: "https://hacker-news.firebaseio.com/v0/topstories.json" },
  {
    groupId: "github",
    url: "https://api.github.com/search/repositories?q=stars:%3E500&sort=updated&per_page=1",
  },
  { groupId: "reddit", url: "https://www.reddit.com/r/programming/rising.json?limit=1" },
  { groupId: "lobsters", url: "https://lobste.rs/hottest.json" },
  { groupId: "devto", url: "https://dev.to/api/articles?top=1&per_page=1" },
  {
    groupId: "arxiv",
    url: "https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=1",
  },
  { groupId: "huggingface", url: "https://huggingface.co/api/models?limit=1" },
  { groupId: "producthunt", url: "https://www.producthunt.com/feed" },
  {
    groupId: "google_news",
    url: "https://news.google.com/rss/search?q=AI&hl=en-US&gl=US&ceid=US:en",
  },
  { groupId: "mastodon", url: "https://mastodon.social/api/v1/trends/links?limit=1" },
  {
    groupId: "stackoverflow",
    url: "https://stackoverflow.com/feeds/tag?tagnames=artificial-intelligence&sort=newest",
  },
  { groupId: "openrouter", url: "https://openrouter.ai/api/v1/models" },
  {
    groupId: "federal_register",
    url: "https://www.federalregister.gov/api/v1/documents.json?per_page=1",
  },
  {
    groupId: "app_store",
    url: "https://rss.applemarketingtools.com/api/v2/us/apps/top-free/10/apps.json",
  },
];
