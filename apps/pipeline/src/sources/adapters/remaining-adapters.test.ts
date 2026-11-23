/**
 * Product Hunt, Bluesky and Stack Exchange (M1-07). Each reads its recorded
 * fixture (`bun run record-fixture <group>`, scrubbed), and each rule it
 * adds on top of `parseFeed` is tested with a hand-written body in the
 * source's own form.
 */
import { describe, expect, test } from "bun:test";
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { LAUNCH_GROUPS } from "../launch-groups.ts";
import { bluesky } from "./bluesky.ts";
import { productHunt } from "./producthunt.ts";
import { stackExchange } from "./stackexchange.ts";

const fixture = (a: Adapter) =>
  Bun.file(new URL(`../fixtures/${a.groupId}.xml`, import.meta.url)).text();

const groupOf = (a: Adapter) => {
  const g = LAUNCH_GROUPS.find((x) => x.id === a.groupId);
  if (!g) throw new Error(`no launch group ${a.groupId}`);
  return g;
};

/** The first item each recorded fixture yields. Five are recorded per group. */
const FIRST: [Adapter, SourceItem][] = [
  [
    productHunt,
    {
      url: "https://example.com/item/6",
      title: "text 7",
      // `published`; the entry's `updated` is the next day, when the feed was regenerated.
      publishedAt: Date.UTC(2026, 10, 22, 22, 44, 38),
      heat: null,
    },
  ],
  [
    bluesky,
    {
      url: "https://example.com/item/4",
      // The post's description: the feed has no titles.
      title: "text 5",
      // "22 Nov 2026 06:20 +0000": no weekday, no seconds.
      publishedAt: Date.UTC(2026, 10, 22, 6, 20),
      heat: null,
    },
  ],
  [
    stackExchange,
    {
      url: "https://example.com/item/15",
      title: "text 9",
      // `published`, when it was asked; `updated` is its last activity.
      publishedAt: Date.UTC(2026, 10, 22, 20, 41, 18),
      heat: 47,
    },
  ],
];

describe("feed adapters read their recorded fixtures", () => {
  for (const [adapter, first] of FIRST) {
    test(adapter.groupId, async () => {
      const items = adapter.parse(await fixture(adapter), "");
      expect(items).toHaveLength(5);
      expect(items[0]).toEqual(first);
      expect(items.every((i) => i.publishedAt !== null)).toBe(true);
    });
  }

  test("stackexchange reads every entry's rank", async () => {
    const items = stackExchange.parse(await fixture(stackExchange), "");
    expect(items.map((i) => i.heat)).toEqual([47, 22, 18, 14, 12]);
  });
});

describe("feed adapters refuse a body that is not a feed", () => {
  for (const [adapter] of FIRST) {
    test(adapter.groupId, () => {
      expect(() => adapter.parse("<html><body>rate limited</body></html>", "")).toThrow(ParseError);
      expect(() => adapter.parse('{"error":"x"}', "")).toThrow(ParseError);
      expect(() => adapter.parse("", "")).toThrow(ParseError);
    });
  }
});

describe("producthunt", () => {
  test("an entry is dated by published, not by updated", () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <published>2026-11-20T09:00:00-08:00</published>
        <updated>2026-11-23T01:12:40-08:00</updated>
        <link rel="alternate" type="text/html" href="https://www.producthunt.com/products/a"/>
        <title>A &amp; B&#8217;s app</title>
      </entry>
    </feed>`;
    expect(productHunt.parse(body, "")).toEqual([
      {
        url: "https://www.producthunt.com/products/a",
        title: "A & B’s app",
        publishedAt: Date.UTC(2026, 10, 20, 17),
        heat: null,
      },
    ]);
  });
});

describe("bluesky", () => {
  const post = (inner: string) => `<rss version="2.0"><channel>
    <title>@someone.example - Someone</title>
    <link>https://bsky.app/profile/someone.example</link>
    <item>${inner}</item>
  </channel></rss>`;

  test("a post is its bsky.app link and its text, not its at:// guid", () => {
    const body = post(`
      <link>https://bsky.app/profile/someone.example/post/3abc</link>
      <description>New model out &amp; it&#8217;s fast.
More: https://example.com/a</description>
      <pubDate>22 Nov 2026 06:20 +0000</pubDate>
      <guid isPermaLink="false">at://did:plc:abc/app.bsky.feed.post/3abc</guid>`);
    expect(bluesky.parse(body, "")).toEqual([
      {
        url: "https://bsky.app/profile/someone.example/post/3abc",
        title: "New model out & it’s fast. More: https://example.com/a",
        publishedAt: Date.UTC(2026, 10, 22, 6, 20),
        heat: null,
      },
    ]);
  });

  test("a post with no text (an image only) is skipped", () => {
    const body = post(`
      <link>https://bsky.app/profile/someone.example/post/3img</link>
      <description></description>
      <pubDate>22 Nov 2026 06:20 +0000</pubDate>
      <guid isPermaLink="false">at://did:plc:abc/app.bsky.feed.post/3img</guid>`);
    expect(bluesky.parse(body, "")).toEqual([]);
  });

  test("a post with no bsky.app link is skipped, not read from its at:// guid", () => {
    const body = post(`
      <description>text</description>
      <guid isPermaLink="false">at://did:plc:abc/app.bsky.feed.post/3x</guid>`);
    expect(bluesky.parse(body, "")).toEqual([]);
  });

  test("an account with no posts is no items, not an error", () => {
    expect(
      bluesky.parse(
        '<rss version="2.0"><channel><title>t</title><link>https://bsky.app/</link></channel></rss>',
        "",
      ),
    ).toEqual([]);
  });

  test("fetches every member account's feed, each parsed on its own", async () => {
    const group = groupOf(bluesky);
    const members = group.members ?? [];
    expect(members.length).toBeGreaterThan(1);
    expect(bluesky.urls(group, 0)).toEqual(members);
    // One member answering with an error page throws for that URL only.
    const good = await fixture(bluesky);
    expect(() => bluesky.parse("<html>503</html>", members[0] ?? "")).toThrow(ParseError);
    expect(bluesky.parse(good, members[1] ?? "")).toHaveLength(5);
  });
});

describe("stackexchange", () => {
  test("heat is re:rank; an entry without one has none", () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:re="http://purl.org/atompub/rank/1.0">
      <entry>
        <id>https://example.stackexchange.com/q/1</id>
        <re:rank scheme="https://example.stackexchange.com">31</re:rank>
        <title type="text">Why is &lt;div&gt; slow?</title>
        <link rel="alternate" href="https://example.stackexchange.com/questions/1/why"/>
        <published>2026-11-22T20:41:18Z</published>
        <updated>2026-11-23T06:04:13Z</updated>
      </entry>
      <entry>
        <title type="text">No rank</title>
        <link rel="alternate" href="https://example.stackexchange.com/questions/2/no"/>
        <published>2026-11-21T10:00:00Z</published>
      </entry>
    </feed>`;
    expect(stackExchange.parse(body, "")).toEqual([
      {
        url: "https://example.stackexchange.com/questions/1/why",
        title: "Why is <div> slow?",
        publishedAt: Date.UTC(2026, 10, 22, 20, 41, 18),
        heat: 31,
      },
      {
        url: "https://example.stackexchange.com/questions/2/no",
        title: "No rank",
        publishedAt: Date.UTC(2026, 10, 21, 10),
        heat: null,
      },
    ]);
  });
});

test("producthunt and stackexchange fetch one fixed URL each", () => {
  expect(productHunt.urls(groupOf(productHunt), 0)).toEqual(["https://www.producthunt.com/feed"]);
  expect(stackExchange.urls(groupOf(stackExchange), 0)).toEqual([
    "https://stackexchange.com/feeds/questions",
  ]);
});
