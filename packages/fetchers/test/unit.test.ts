// Unit tests for the XML subset parser's coverage boundary and for
// common helpers not exercised by the golden payloads.

import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";

import { missing, ok, parseFeed, USER_AGENT } from "../src/common.js";
import { findText, iter, parseXml, XmlParseError } from "../src/xml.js";

describe("xml parser", () => {
  it("decodes entities and CDATA", () => {
    const root = parseXml(
      '<rss><channel><item><title>A &amp; B &#8212; C</title>' +
        "<desc><![CDATA[x < y & z]]></desc></item></channel></rss>",
    );
    const item = root.children[0].children[0];
    strictEqual(findText(item, "title"), "A & B — C");
    strictEqual(findText(item, "desc"), "x < y & z");
  });
  it("resolves default and prefixed namespaces to expanded names", () => {
    const root = parseXml(
      '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">' +
        '<entry><arxiv:primary_category term="cs.CL"/></entry></feed>',
    );
    const entries = iter(root, "{http://www.w3.org/2005/Atom}entry");
    strictEqual(entries.length, 1);
    const primary = entries[0].children[0];
    strictEqual(primary.tag, "{http://arxiv.org/schemas/atom}primary_category");
    strictEqual(primary.attrs["term"], "cs.CL");
  });
  it("throws XmlParseError on malformed input", () => {
    throws(() => parseXml("<rss><channel></rss>"), (e: unknown) => e instanceof XmlParseError);
    throws(() => parseXml("not xml at all"), (e: unknown) => e instanceof XmlParseError);
    throws(() => parseFeed("<rss><channel>", "s", "o"), (e: unknown) => e instanceof XmlParseError);
  });
  it("parseFeed respects the RSS limit before filtering, like Python", () => {
    const xml =
      "<rss><channel>" +
      "<item><title></title><link>https://e.com/1</link></item>" +
      "<item><title>Second</title><link>https://e.com/2</link></item>" +
      "<item><title>Third</title><link>https://e.com/3</link></item>" +
      "</channel></rss>";
    // limit=2 slices the first two items first; the empty first one
    // is dropped and NOT replaced by the third.
    deepStrictEqual(parseFeed(xml, "s", "o", 2).map((i) => i.name), ["Second"]);
  });
  it("parseFeed picks the alternate Atom link, skipping rel=self", () => {
    const xml =
      '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title>' +
      '<link rel="self" href="https://e.com/self"/>' +
      '<link rel="alternate" href="https://e.com/alt"/></entry></feed>';
    strictEqual(parseFeed(xml, "s", "o")[0].url, "https://e.com/alt");
  });
});

describe("common helpers", () => {
  it("ok/missing shapes match Python", () => {
    deepStrictEqual(missing("s", 1, "why"), {
      source: "s", layer: 1, status: "missing", items: [], note: "why",
    });
    deepStrictEqual(ok("s", 2, [], ""), {
      source: "s", layer: 2, status: "ok", items: [], note: "",
    });
  });
  it("USER_AGENT is byte-identical to Python's", () => {
    strictEqual(USER_AGENT, "triple-sigma/0.5.1 (+https://github.com/daiyanze/triple-sigma)");
  });
});
