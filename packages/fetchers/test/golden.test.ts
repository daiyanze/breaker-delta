// Parity tests: every case in fixtures/golden-fetchers.json was
// produced by running the Python parse functions
// (scripts/make_golden_fetchers.py) over canned payloads copied from
// tests/test_fetchers.py. These tests replay the same inputs through
// the TypeScript port and compare item by item.

import { deepStrictEqual } from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseFeed } from "../src/common.js";
import * as arxiv from "../src/fetchers/arxiv.js";
import * as appstore from "../src/fetchers/appstore.js";
import * as bluesky from "../src/fetchers/bluesky.js";
import * as civitai from "../src/fetchers/civitai.js";
import * as dailypapers from "../src/fetchers/dailypapers.js";
import * as devto from "../src/fetchers/devto.js";
import * as federalregister from "../src/fetchers/federalregister.js";
import * as github from "../src/fetchers/github.js";
import * as googlenews from "../src/fetchers/googlenews.js";
import * as hackernews from "../src/fetchers/hackernews.js";
import * as hfspaces from "../src/fetchers/hfspaces.js";
import * as huggingface from "../src/fetchers/huggingface.js";
import * as lobsters from "../src/fetchers/lobsters.js";
import * as mastodon from "../src/fetchers/mastodon.js";
import * as openrouter from "../src/fetchers/openrouter.js";
import * as producthunt from "../src/fetchers/producthunt.js";
import * as reddit from "../src/fetchers/reddit.js";
import * as showhn from "../src/fetchers/showhn.js";
import * as sitemaps from "../src/fetchers/sitemaps.js";
import * as wikipedia from "../src/fetchers/wikipedia.js";
import * as x from "../src/fetchers/x.js";

const goldenPath = fileURLToPath(
  new URL("../../fixtures/golden-fetchers.json", import.meta.url).href,
);
const G = JSON.parse(fs.readFileSync(goldenPath, "utf-8"));
const NOW = new Date(G.now);
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("golden: github", () => {
  for (const [i, c] of (G.github_parse_search as Any[]).entries()) {
    it(`parse_search case ${i}`, () =>
      deepStrictEqual(github.parseSearch(clone(c.payload), NOW, clone(c.cfg)), c.expected));
  }
  for (const [i, c] of (G.github_parse_trending as Any[]).entries()) {
    it(`parse_trending case ${i}`, () =>
      deepStrictEqual(github.parseTrending(c.html), c.expected));
  }
});

describe("golden: algolia sources", () => {
  it("hackernews", () =>
    deepStrictEqual(hackernews.parse(clone(G.hackernews_parse[0].payload)),
      G.hackernews_parse[0].expected));
  it("showhn", () =>
    deepStrictEqual(showhn.parse(clone(G.showhn_parse[0].payload)),
      G.showhn_parse[0].expected));
});

describe("golden: huggingface / hfspaces", () => {
  it("huggingface", () =>
    deepStrictEqual(huggingface.parse(clone(G.huggingface_parse[0].payload), NOW),
      G.huggingface_parse[0].expected));
  it("hfspaces", () =>
    deepStrictEqual(hfspaces.parse(clone(G.hfspaces_parse[0].payload), NOW),
      G.hfspaces_parse[0].expected));
});

describe("golden: reddit", () => {
  it("parse", () =>
    deepStrictEqual(
      reddit.parse(clone(G.reddit_parse[0].payload), G.reddit_parse[0].subreddit),
      G.reddit_parse[0].expected));
  it("parse_rss", () =>
    deepStrictEqual(
      reddit.parseRss(G.reddit_parse_rss[0].xml, G.reddit_parse_rss[0].subreddit),
      G.reddit_parse_rss[0].expected));
});

describe("golden: feeds", () => {
  for (const [i, c] of (G.parse_feed as Any[]).entries()) {
    it(`parse_feed case ${i}`, () =>
      deepStrictEqual(parseFeed(c.xml, c.source, c.outlet, c.limit), c.expected));
  }
  it("googlenews", () =>
    deepStrictEqual(googlenews.parse(G.googlenews_parse[0].xml),
      G.googlenews_parse[0].expected));
  it("producthunt feed", () =>
    deepStrictEqual(producthunt.parseFeed(G.producthunt_parse_feed[0].xml),
      G.producthunt_parse_feed[0].expected));
  it("producthunt graphql", () =>
    deepStrictEqual(producthunt.parse(clone(G.producthunt_parse[0].payload)),
      G.producthunt_parse[0].expected));
  it("bluesky", () =>
    deepStrictEqual(
      bluesky.parse(G.bluesky_parse[0].xml, G.bluesky_parse[0].handle, G.bluesky_parse[0].limit),
      G.bluesky_parse[0].expected));
});

describe("golden: arxiv / openrouter / dailypapers", () => {
  it("arxiv", () =>
    deepStrictEqual(arxiv.parse(G.arxiv_parse[0].xml), G.arxiv_parse[0].expected));
  it("openrouter", () =>
    deepStrictEqual(openrouter.parse(clone(G.openrouter_parse[0].payload), NOW),
      G.openrouter_parse[0].expected));
  it("dailypapers", () =>
    deepStrictEqual(dailypapers.parse(clone(G.dailypapers_parse[0].payload)),
      G.dailypapers_parse[0].expected));
});

describe("golden: devto / lobsters / mastodon / civitai", () => {
  it("devto", () =>
    deepStrictEqual(devto.parse(clone(G.devto_parse[0].payload)), G.devto_parse[0].expected));
  it("lobsters", () =>
    deepStrictEqual(lobsters.parse(clone(G.lobsters_parse[0].payload)),
      G.lobsters_parse[0].expected));
  it("mastodon links", () =>
    deepStrictEqual(mastodon.parseLinks(clone(G.mastodon_parse_links[0].payload)),
      G.mastodon_parse_links[0].expected));
  it("mastodon tags", () =>
    deepStrictEqual(mastodon.parseTags(clone(G.mastodon_parse_tags[0].payload)),
      G.mastodon_parse_tags[0].expected));
  it("civitai", () =>
    deepStrictEqual(civitai.parse(clone(G.civitai_parse[0].payload)),
      G.civitai_parse[0].expected));
});

describe("golden: appstore", () => {
  it("parse", () =>
    deepStrictEqual(
      appstore.parse(clone(G.appstore_parse[0].payload), G.appstore_parse[0].chart),
      G.appstore_parse[0].expected));
  it("parse_legacy", () =>
    deepStrictEqual(
      appstore.parseLegacy(
        clone(G.appstore_parse_legacy[0].payload), G.appstore_parse_legacy[0].chart),
      G.appstore_parse_legacy[0].expected));
});

describe("golden: sitemaps", () => {
  for (const [i, c] of (G.sitemaps_parse_urlset as Any[]).entries()) {
    it(`parse_urlset case ${i}`, () =>
      deepStrictEqual(sitemaps.parseUrlset(c.xml, clone(c.site), NOW), c.expected));
  }
  for (const [i, c] of (G.sitemaps_parse_index as Any[]).entries()) {
    it(`parse_index case ${i}`, () =>
      deepStrictEqual(sitemaps.parseIndex(c.xml, c.pattern), c.expected));
  }
  for (const [i, c] of (G.sitemaps_diff as Any[]).entries()) {
    it(`diff step ${i}`, () => {
      const { fresh, updated, baseline } = sitemaps.diffItems(
        clone(c.items), clone(c.seen), NOW);
      deepStrictEqual(
        { fresh, seen: updated, baseline },
        c.expected);
    });
  }
});

describe("golden: wikipedia / federalregister / x", () => {
  it("wikipedia", () =>
    deepStrictEqual(
      wikipedia.parse(clone(G.wikipedia_parse[0].payload), G.wikipedia_parse[0].limit),
      G.wikipedia_parse[0].expected));
  it("federalregister", () =>
    deepStrictEqual(
      federalregister.parse(
        clone(G.federalregister_parse[0].payload), G.federalregister_parse[0].limit),
      G.federalregister_parse[0].expected));
  it("x", () =>
    deepStrictEqual(x.parse(clone(G.x_parse[0].payload)), G.x_parse[0].expected));
});
