/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { FONT_FILES } from "../tokens/index.ts";
import { CLIENT, Document, renderDocument } from "./index.ts";

describe("Document and renderDocument", () => {
  test("a document starts with its doctype and holds the language and title", () => {
    const html = renderDocument(
      <Document lang="ja" title="T">
        <p>x</p>
      </Document>,
    );
    expect(html).toStartWith('<!doctype html><html lang="ja"><head><meta charset="utf-8"/>');
    expect(html).toContain("<title>T</title>");
    expect(html).toContain("<body><p>x</p></body></html>");
    expect(html).not.toContain("data-theme");
  });

  test("the head preloads the first-line fonts, links the stylesheet, then the page's own", () => {
    const html = renderDocument(
      <Document lang="en" title="T" head={<meta name="robots" content="noindex" />}>
        {null}
      </Document>,
    );
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    for (const f of FONT_FILES.filter((f) => f.preload)) {
      expect(head).toContain(`href="${CLIENT.fonts}/${f.file}" as="font"`);
    }
    expect(head.indexOf(`href="${CLIENT.css}"`)).toBeLessThan(head.indexOf('name="robots"'));
  });

  test("a theme sets data-theme on <html>", () => {
    const html = renderDocument(
      <Document lang="en" title="T" theme="dark">
        {null}
      </Document>,
    );
    expect(html).toContain('<html lang="en" data-theme="dark">');
  });

  test("text and attributes are escaped by the renderer", () => {
    const html = renderDocument(
      <Document lang={'en"'} title="<script>&">
        <a href={'x" onclick="y'}>{"<script>alert(1)</script>"}</a>
      </Document>,
    );
    expect(html).toContain('<html lang="en&quot;">');
    expect(html).toContain("<title>&lt;script>&amp;</title>");
    expect(html).toContain('<a href="x&quot; onclick=&quot;y">&lt;script>alert(1)&lt;/script></a>');
    expect(html.match(/<script/g)).toBeNull();
  });
});
