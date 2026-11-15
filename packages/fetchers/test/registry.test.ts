// Registry parity with radar/fetchers/__init__.py: same fetchers,
// same order (layer order), same SOURCE/LAYER values — plus the
// assertions tests/test_fetchers.py makes in test_new_fetchers_registered.

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import { FETCHERS } from "../src/fetchers/index.js";
import * as releases from "../src/fetchers/releases.js";
import * as stackexchange from "../src/fetchers/stackexchange.js";

const EXPECTED_ORDER: [string, number][] = [
  ["x", 1], ["official_blogs", 1], ["github", 1], ["hackernews", 1],
  ["show_hn", 1], ["huggingface", 1], ["hf_spaces", 1], ["openrouter", 1],
  ["civitai", 1], ["arxiv", 1], ["daily_papers", 1], ["bluesky", 1],
  ["producthunt", 1], ["gh_releases", 1], ["federal_register", 1],
  ["reddit", 2], ["tech_media", 2], ["devto", 2], ["lobsters", 2],
  ["stackexchange", 2], ["mastodon", 2], ["wikipedia", 2],
  ["sitemaps", 2], ["app_store", 2], ["google_news", 2],
];

describe("fetcher registry", () => {
  it("has all 25 fetchers in Python registry order", () => {
    strictEqual(FETCHERS.length, 25);
    deepStrictEqual(FETCHERS.map((f) => [f.SOURCE, f.LAYER]), EXPECTED_ORDER);
  });
  it("new fetchers registered with the right layers (mirrors Python test)", () => {
    const bySource = new Map(FETCHERS.map((f) => [f.SOURCE, f]));
    strictEqual(bySource.get("gh_releases")?.LAYER, 1);
    strictEqual(bySource.get("federal_register")?.LAYER, 1);
    strictEqual(bySource.get("stackexchange")?.LAYER, 2);
    strictEqual(releases.DEFAULT_FEEDS.length, 3);
    strictEqual(
      stackexchange.DEFAULT_FEEDS[0].url.endsWith("feeds/questions"), true);
  });
  it("every fetcher exposes a fetch function", () => {
    for (const f of FETCHERS) strictEqual(typeof f.fetch, "function");
  });
});
