/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { FONT_FILES } from "../tokens/index.ts";
import { CLIENT, Document, renderDocument, THEME_KEY, THEME_SCRIPT } from "./index.ts";

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
    // Only the document's own two scripts: the theme script and the loader.
    expect(html.match(/<script/g)).toHaveLength(2);
  });

  test("the head applies a stored theme before anything paints, and loads the loader as a module", () => {
    const html = renderDocument(
      <Document lang="en" title="T">
        {null}
      </Document>,
    );
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    const theme = head.indexOf(`<script>${THEME_SCRIPT}</script>`);
    expect(theme).toBeGreaterThan(-1);
    expect(theme).toBeLessThan(head.indexOf("<link"));
    expect(head).toContain(`<script type="module" src="${CLIENT.loader}"></script>`);
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_KEY));
  });

  test("the theme script sets a stored light or dark theme, and nothing else", () => {
    const run = (stored: string | null, throws = false) => {
      const root = { dataset: {} as Record<string, string> };
      const storage = {
        getItem: (key: string) => {
          if (throws) throw new Error("denied");
          return key === THEME_KEY ? stored : null;
        },
      };
      new Function("localStorage", "document", THEME_SCRIPT)(storage, { documentElement: root });
      return root.dataset.theme;
    };
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
    expect(run(null)).toBeUndefined();
    expect(run('"><script>')).toBeUndefined();
    expect(run("dark", true)).toBeUndefined();
  });
});
