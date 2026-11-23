import { describe, expect, test } from "bun:test";
import { normaliseUrl } from "./url.ts";

/** Each group: one resource written the ways sources write it. */
const SAME: Record<string, readonly string[]> = {
  "https://example.com/post/42": [
    "https://example.com/post/42",
    "http://example.com/post/42",
    "HTTPS://EXAMPLE.COM/post/42",
    "https://Example.Com./post/42",
    "https://example.com:443/post/42",
    "http://example.com:80/post/42",
    "https://example.com/post/42/",
    "https://example.com/post/42//",
    "https://example.com/post/42#comments",
    "https://example.com/post/42#:~:text=wave",
    "https://example.com/post/42?",
    "https://example.com/post/42?&",
    "https://user:secret@example.com/post/42",
    "  https://example.com/post/42\n",
    "https://example.com/a/../post/./42",
    "https://example.com/post/42?utm_source=hn&utm_medium=social&utm_campaign=x",
    "https://example.com/post/42?UTM_Source=hn",
    "https://example.com/post/42?utm%5Fsource=hn",
    "https://example.com/post/42?fbclid=abc&gclid=def&msclkid=ghi",
    "https://example.com/post/42?mc_cid=1&mc_eid=2&_hsenc=3&_hsmi=4&igshid=5",
    "http://EXAMPLE.com./post/42/?utm_content=a#top",
  ],
  "https://news.example/item?id=8863": [
    "https://news.example/item?id=8863",
    "http://news.example/item?id=8863&utm_source=feed",
    "https://news.example/item/?fbclid=x&id=8863",
  ],
  "https://example.com/search?lang=en&q=tide": [
    "https://example.com/search?q=tide&lang=en",
    "https://example.com/search?lang=en&q=tide",
    "https://example.com/search?utm_term=x&q=tide&gclid=y&lang=en",
  ],
  "https://example.com/": [
    "https://example.com",
    "https://example.com/",
    "http://example.com/?utm_source=x",
    "https://example.com/#",
  ],
  "https://xn--bcher-kva.example/x": ["https://bücher.example/x", "https://BÜCHER.example/x/"],
  // RFC 3986 2.3: an escaped unreserved character is the character itself.
  "https://example.com/~tide/a-b_c.d?q=~x": [
    "https://example.com/~tide/a-b_c.d?q=~x",
    "https://example.com/%7Etide/a-b_c.d?q=%7Ex",
    "https://example.com/%7etide/a%2Db%5Fc%2Ed?q=%7ex",
    "https://example.com/%7E%74ide/a-b_c.d?%71=~x",
  ],
  // RFC 3986 6.2.2.1: escapes that stay are upper case.
  "https://example.com/a%2Fb?q=a%26b": [
    "https://example.com/a%2Fb?q=a%26b",
    "https://example.com/a%2fb?q=a%26b",
    "https://example.com/a%2fb?q=a%26b",
  ],
};

/** Input -> output, where the output keeps something a careless rule would drop. */
const KEPT: Record<string, string> = {
  // An escaped `&` and `=` are part of the value, not a tracking pair.
  "https://example.com/s?q=a%26utm_source%3Dx": "https://example.com/s?q=a%26utm_source%3Dx",
  // Pairs are kept as written: no re-encoding, a bare name stays bare.
  "https://example.com/s?q=a%20b+c&flag": "https://example.com/s?flag&q=a%20b+c",
  // Repeated names keep their order; names sort ignoring case.
  "https://example.com/s?tag=b&A=0&tag=a": "https://example.com/s?A=0&tag=b&tag=a",
  // Names that differ only in case keep their order: some servers read
  // names without case and take the first value.
  "https://example.com/s?id=1&ID=2": "https://example.com/s?id=1&ID=2",
  "https://example.com/s?ID=2&b=0&id=1": "https://example.com/s?b=0&ID=2&id=1",
  // Names that carry meaning on some sites are not tracking.
  "https://example.com/s?ref=main&source=x&si=1": "https://example.com/s?ref=main&si=1&source=x",
  // A non-default port names another service: keep the scheme.
  "http://example.com:8080/a/": "http://example.com:8080/a",
  "https://[::1]:8443/x/": "https://[::1]:8443/x",
  // An escaped slash is part of the segment, not a trailing slash.
  "https://example.com/a%2F/": "https://example.com/a%2F",
  // Path case is kept.
  "https://example.com/Wiki/Tide_(Paper)": "https://example.com/Wiki/Tide_(Paper)",
};

/** Pairs that are different resources and must stay different. */
const DIFFERENT: readonly (readonly [string, string])[] = [
  ["https://example.com/Post", "https://example.com/post"],
  ["https://news.example/item?id=1", "https://news.example/item?id=2"],
  ["https://example.com/a", "https://www.example.com/a"],
  ["https://example.com/a?x=1&x=2", "https://example.com/a?x=2&x=1"],
  ["https://example.com/a?id=1&ID=2", "https://example.com/a?ID=2&id=1"],
  ["http://example.com:8080/a", "https://example.com:8080/a"],
];

describe("normaliseUrl", () => {
  for (const [expected, variants] of Object.entries(SAME)) {
    test(`every variant of ${expected} gives it`, () => {
      for (const v of variants) expect([v, normaliseUrl(v)]).toEqual([v, expected]);
    });
  }

  test("is idempotent on every case here", () => {
    const all = [
      ...Object.values(SAME).flat(),
      ...Object.keys(KEPT),
      ...Object.values(KEPT),
      ...DIFFERENT.flat(),
    ];
    for (const v of all) {
      const once = normaliseUrl(v);
      expect(once).not.toBeNull();
      expect([v, normaliseUrl(once ?? "")]).toEqual([v, once]);
    }
  });

  test("keeps what identifies the resource", () => {
    for (const [input, expected] of Object.entries(KEPT)) {
      expect([input, normaliseUrl(input)]).toEqual([input, expected]);
    }
  });

  test("keeps different resources apart", () => {
    for (const [a, b] of DIFFERENT) expect(normaliseUrl(a)).not.toBe(normaliseUrl(b));
  });

  test("refuses what is not an absolute http(s) URL", () => {
    for (const v of ["", "not a url", "/relative/path", "example.com/a", "ftp://example.com/a"]) {
      expect([v, normaliseUrl(v)]).toEqual([v, null]);
    }
    expect(normaliseUrl("mailto:a@example.com")).toBeNull();
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
  });
});
