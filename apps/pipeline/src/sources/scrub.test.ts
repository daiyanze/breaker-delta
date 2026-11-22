import { describe, expect, test } from "bun:test";
import { ParseError } from "./adapter.ts";
import { parseFeed } from "./parse.ts";
import { scrubJson, scrubXml } from "./scrub.ts";

describe("scrubJson", () => {
  test("replaces words and URLs, keeps keys, numbers, booleans, null and dates", () => {
    const body = JSON.stringify([
      {
        title: "Secret headline",
        url: "https://news.example.org/story?id=7",
        created_at: "2026-11-20T09:15:02.000-06:00",
        score: 42,
        count: "17",
        ok: true,
        none: null,
        tags: ["ai", "rust"],
      },
    ]);
    const out = scrubJson(body, 5);
    expect(out).not.toContain("Secret");
    expect(out).not.toContain("news.example.org");
    expect(out).not.toContain("rust");
    expect(JSON.parse(out)).toEqual([
      {
        title: "text 1",
        url: "https://example.com/item/2",
        created_at: "2026-11-20T09:15:02.000-06:00",
        score: 42,
        count: "17",
        ok: true,
        none: null,
        tags: ["text 3", "text 4"],
      },
    ]);
  });

  test("cuts every list to maxItems", () => {
    const out = JSON.parse(scrubJson(JSON.stringify({ a: [1, 2, 3, 4], b: [[1, 2, 3]] }), 2));
    expect(out).toEqual({ a: [1, 2], b: [[1, 2]] });
  });

  test("refuses a body that is not JSON", () => {
    expect(() => scrubJson("<html>", 5)).toThrow(ParseError);
  });
});

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Private blog name</title>
  <entry>
    <title type="html">Secret &amp; <![CDATA[<b>headline</b>]]></title>
    <link rel="alternate" type="text/html" href="https://blog.example.org/post-1"/>
    <published>2026-11-20T09:00:00Z</published>
    <summary>Long article text that must not be kept.</summary>
  </entry>
  <entry><title>Two</title><link href="https://blog.example.org/2"/></entry>
  <entry><title>Three</title><link href="https://blog.example.org/3"/></entry>
</feed>`;

describe("scrubXml", () => {
  test("keeps the shape an adapter reads and drops the words", () => {
    const out = scrubXml(FEED, 2);
    for (const word of ["Private", "Secret", "headline", "article", "blog.example.org", "Three"]) {
      expect(out).not.toContain(word);
    }
    expect(out).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(out).toContain('rel="alternate"');
    expect(out).toContain('type="text/html"');
    expect(out).toContain("<published>2026-11-20T09:00:00Z</published>");
    // Still a feed with the first two entries, which an adapter can read.
    // Text and CDATA are scrubbed apart, so the first title has two placeholders.
    expect(parseFeed(out)).toEqual([
      {
        url: "https://example.com/item/4",
        title: "text 2text 3",
        publishedAt: Date.UTC(2026, 10, 20, 9),
        heat: null,
      },
      { url: "https://example.com/item/7", title: "text 6", publishedAt: null, heat: null },
    ]);
  });

  test("scrubs RSS with RFC 822 dates kept", () => {
    const rss = `<rss version="2.0"><channel><item><title>Words here</title>
      <link>https://site.example.org/a</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
    const out = scrubXml(rss, 5);
    expect(out).not.toContain("Words");
    expect(out).toContain("<pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate>");
    expect(parseFeed(out)).toHaveLength(1);
  });

  test("host names in attributes are scrubbed", () => {
    const rss = `<rss><channel><item><category domain="secret.example.org">c</category></item></channel></rss>`;
    expect(scrubXml(rss, 5)).not.toContain("secret");
  });

  test("refuses a body that is not XML", () => {
    expect(() => scrubXml("", 5)).toThrow(ParseError);
  });
});
