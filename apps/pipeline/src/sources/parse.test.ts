import { describe, expect, test } from "bun:test";
import { ParseError } from "./adapter.ts";
import { parseDate, parseFeed, parseJson } from "./parse.ts";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Feed</title>
    <link>https://example.com/</link>
    <atom:link href="https://example.com/feed" rel="self" type="application/rss+xml"/>
    <item>
      <title>First &amp; <![CDATA[best]]></title>
      <link>https://example.com/1</link>
      <pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>
        2026
      </title>
      <guid isPermaLink="true">https://example.com/2</guid>
      <dc:date>2026-11-20T10:00:00Z</dc:date>
    </item>
    <item>
      <title>Opaque guid</title>
      <guid isPermaLink="false">tag:example.com,2026:3</guid>
    </item>
    <item>
      <link>https://example.com/no-title</link>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed</title>
  <entry>
    <title type="html">An &lt;em&gt;entry&lt;/em&gt;</title>
    <link rel="replies" href="https://example.com/1#comments"/>
    <link rel="alternate" type="text/html" href="https://example.com/1"/>
    <published>2026-11-20T09:00:00+09:00</published>
    <updated>2026-11-21T09:00:00+09:00</updated>
  </entry>
  <entry>
    <title>Only one link, no rel</title>
    <link href="https://example.com/2"/>
    <updated>2026-11-20T00:00:00Z</updated>
  </entry>
  <entry>
    <title>No link</title>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.com/"><title>Feed</title></channel>
  <item rdf:about="https://example.com/1">
    <title>RDF item</title>
    <link>https://example.com/1</link>
    <dc:date>2026-11-20T09:00:00Z</dc:date>
  </item>
</rdf:RDF>`;

describe("parseFeed", () => {
  test("RSS 2.0: link or permalink guid, pubDate or dc:date, entities and CDATA", () => {
    expect(parseFeed(RSS)).toEqual([
      {
        url: "https://example.com/1",
        title: "First & best",
        publishedAt: Date.UTC(2026, 10, 20, 9),
        heat: null,
      },
      {
        url: "https://example.com/2",
        title: "2026",
        publishedAt: Date.UTC(2026, 10, 20, 10),
        heat: null,
      },
    ]);
  });

  test("Atom: the alternate link, published before updated, html titles as text", () => {
    expect(parseFeed(ATOM)).toEqual([
      {
        url: "https://example.com/1",
        title: "An <em>entry</em>",
        publishedAt: Date.UTC(2026, 10, 20, 0),
        heat: null,
      },
      {
        url: "https://example.com/2",
        title: "Only one link, no rel",
        publishedAt: Date.UTC(2026, 10, 20),
        heat: null,
      },
    ]);
  });

  test("RSS 1.0 (RDF)", () => {
    expect(parseFeed(RDF)).toEqual([
      {
        url: "https://example.com/1",
        title: "RDF item",
        publishedAt: Date.UTC(2026, 10, 20, 9),
        heat: null,
      },
    ]);
  });

  test("a single item is still a list", () => {
    const one = `<rss><channel><item><title>A</title><link>https://example.com/a</link></item></channel></rss>`;
    expect(parseFeed(one)).toHaveLength(1);
  });

  test("feeds with no items are empty, not errors", () => {
    expect(parseFeed(`<rss version="2.0"><channel><title>t</title></channel></rss>`)).toEqual([]);
    expect(parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"></feed>`)).toEqual([]);
    expect(parseFeed(`<feed/>`)).toEqual([]);
  });

  test("many escaped characters are not an entity-expansion error", () => {
    const items = Array.from(
      { length: 300 },
      (_, i) =>
        `<item><title>A &amp; B &lt; C &quot;${i}&quot;</title><link>https://example.com/${i}</link></item>`,
    );
    const feed = parseFeed(`<rss><channel>${items.join("")}</channel></rss>`);
    expect(feed).toHaveLength(300);
    expect(feed[0]?.title).toBe('A & B < C "0"');
  });

  test("numeric character references are decoded, and escapes only once", () => {
    const rss = `<rss><channel><item><title>It&#8217;s &#x2014; ok &amp; &quot;q&quot; &amp;#38;</title>
      <link>https://example.com/a</link></item></channel></rss>`;
    expect(parseFeed(rss)[0]?.title).toBe('It\u2019s \u2014 ok & "q" &#38;');
  });

  test("namespaced elements do not stand in for RSS or Atom ones", () => {
    const rss = `<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
      <channel><item><atom:link href="https://example.com/self" rel="self"/><media:title>Media</media:title>
      <title>Real</title><link>https://example.com/real</link></item></channel></rss>`;
    expect(parseFeed(rss)).toEqual([
      { url: "https://example.com/real", title: "Real", publishedAt: null, heat: null },
    ]);
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Podcast</title>
      <link rel="enclosure" href="https://example.com/a.mp3"/></entry></feed>`;
    expect(parseFeed(atom)).toEqual([]);
  });

  test("items without an absolute http(s) URL are skipped", () => {
    const links = ["javascript:alert(1)", "/relative/path", "12345", "https://example.com/ok"];
    const items = links.map((l) => `<item><title>T</title><link>${l}</link></item>`).join("");
    const guid = `<item><title>G</title><guid>12345</guid></item>`;
    expect(parseFeed(`<rss><channel>${items}${guid}</channel></rss>`).map((i) => i.url)).toEqual([
      "https://example.com/ok",
    ]);
  });

  test("anything else is a ParseError", () => {
    expect(() => parseFeed("<html><body>blocked</body></html>")).toThrow(ParseError);
    expect(() => parseFeed('{"items": []}')).toThrow(ParseError);
    expect(() => parseFeed("")).toThrow(ParseError);
  });
});

describe("parseJson and parseDate", () => {
  test("parseJson throws a ParseError on HTML", () => {
    expect(parseJson("[1]")).toEqual([1]);
    expect(() => parseJson("<html>")).toThrow(ParseError);
  });

  test("parseDate reads ISO and RFC 822, and returns null otherwise", () => {
    expect(parseDate("2026-11-20T09:00:00Z")).toBe(Date.UTC(2026, 10, 20, 9));
    expect(parseDate("Fri, 20 Nov 2026 09:00:00 +0000")).toBe(Date.UTC(2026, 10, 20, 9));
    expect(parseDate("soon")).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate(1_700_000_000)).toBeNull();
  });
});
