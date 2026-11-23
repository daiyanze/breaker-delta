/** Every adapter, by fetch group id. A group without an entry is not fetched yet. */
import type { Adapter } from "../adapter.ts";
import { appStore } from "./app-store.ts";
import { arxiv } from "./arxiv.ts";
import { dailyPapers } from "./daily-papers.ts";
import { devto } from "./devto.ts";
import { federalRegister } from "./federal-register.ts";
import { googleNews, officialBlogs, techMedia } from "./feeds.ts";
import { github } from "./github.ts";
import { githubReleases } from "./github-releases.ts";
import { hackernews } from "./hackernews.ts";
import { hfSpaces, huggingface } from "./huggingface.ts";
import { lobsters } from "./lobsters.ts";
import { mastodon } from "./mastodon.ts";
import { openrouter } from "./openrouter.ts";
import { wikipedia } from "./wikipedia.ts";

const ALL: readonly Adapter[] = [
  appStore,
  arxiv,
  dailyPapers,
  devto,
  federalRegister,
  github,
  githubReleases,
  googleNews,
  hackernews,
  hfSpaces,
  huggingface,
  lobsters,
  mastodon,
  officialBlogs,
  openrouter,
  techMedia,
  wikipedia,
];

export const ADAPTERS: Readonly<Record<string, Adapter>> = Object.fromEntries(
  ALL.map((a) => [a.groupId, a]),
);
