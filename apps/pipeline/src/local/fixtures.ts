/// <reference path="./xml.d.ts" />
/**
 * The recorded source fixtures, embedded in the build (#40). `bun build
 * --compile` bundles text imports, so the local executable scans the same
 * fixtures as `bun run local` with `BD_SOURCES=fixtures`; reading them from
 * `src/sources/fixtures` finds nothing in the executable's virtual
 * filesystem. Add a line here with every new fixture; a test fails if one is
 * missing.
 *
 * A JSON file imported as text is typed as its parsed value, so each import
 * is `unknown` here and `text()` checks that Bun gave a string.
 */
import appStoreJson from "../sources/fixtures/app_store.json" with { type: "text" };
import arxivXml from "../sources/fixtures/arxiv.xml" with { type: "text" };
import blueskyXml from "../sources/fixtures/bluesky.xml" with { type: "text" };
import dailyPapersJson from "../sources/fixtures/daily_papers.json" with { type: "text" };
import devtoJson from "../sources/fixtures/devto.json" with { type: "text" };
import federalRegisterJson from "../sources/fixtures/federal_register.json" with { type: "text" };
import ghReleasesXml from "../sources/fixtures/gh_releases.xml" with { type: "text" };
import githubJson from "../sources/fixtures/github.json" with { type: "text" };
import googleNewsXml from "../sources/fixtures/google_news.xml" with { type: "text" };
import hackernewsJson from "../sources/fixtures/hackernews.json" with { type: "text" };
import hfSpacesJson from "../sources/fixtures/hf_spaces.json" with { type: "text" };
import huggingfaceJson from "../sources/fixtures/huggingface.json" with { type: "text" };
import lobstersJson from "../sources/fixtures/lobsters.json" with { type: "text" };
import mastodonJson from "../sources/fixtures/mastodon.json" with { type: "text" };
import officialBlogsXml from "../sources/fixtures/official_blogs.xml" with { type: "text" };
import openrouterJson from "../sources/fixtures/openrouter.json" with { type: "text" };
import producthuntXml from "../sources/fixtures/producthunt.xml" with { type: "text" };
import stackexchangeXml from "../sources/fixtures/stackexchange.xml" with { type: "text" };
import techMediaXml from "../sources/fixtures/tech_media.xml" with { type: "text" };
import wikipediaJson from "../sources/fixtures/wikipedia.json" with { type: "text" };
import wikipediaPageviewsJson from "../sources/fixtures/wikipedia_pageviews.json" with {
  type: "text",
};

function text(file: string, value: unknown): string {
  if (typeof value !== "string") throw new Error(`fixture ${file} was not embedded as text`);
  return value;
}

const EMBEDDED: [string, unknown][] = [
  ["app_store.json", appStoreJson],
  ["arxiv.xml", arxivXml],
  ["bluesky.xml", blueskyXml],
  ["daily_papers.json", dailyPapersJson],
  ["devto.json", devtoJson],
  ["federal_register.json", federalRegisterJson],
  ["gh_releases.xml", ghReleasesXml],
  ["github.json", githubJson],
  ["google_news.xml", googleNewsXml],
  ["hackernews.json", hackernewsJson],
  ["hf_spaces.json", hfSpacesJson],
  ["huggingface.json", huggingfaceJson],
  ["lobsters.json", lobstersJson],
  ["mastodon.json", mastodonJson],
  ["official_blogs.xml", officialBlogsXml],
  ["openrouter.json", openrouterJson],
  ["producthunt.xml", producthuntXml],
  ["stackexchange.xml", stackexchangeXml],
  ["tech_media.xml", techMediaXml],
  ["wikipedia.json", wikipediaJson],
  ["wikipedia_pageviews.json", wikipediaPageviewsJson],
];

/** File name (`<group>.<format>`) to its text. */
export const FIXTURE_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  EMBEDDED.map(([file, value]) => [file, text(file, value)]),
);
