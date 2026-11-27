/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import stripCss from "./DateStrip.css" with { type: "text" };
import stripStates from "./DateStrip.states.tsx";
import { DateStrip } from "./DateStrip.tsx";

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

const PROPS = {
  month: "Nov",
  day: "19",
  date: "Thursday, November 19, 2026",
  dateTime: "2026-11-19",
  line: "No. 323. Sea state: choppy.",
  count: "16 waves up",
  note: "5 new today, scanned 14:00",
  shortNote: "5 new today",
  search: { href: "/search", label: "Search" },
};

describe("date strip", () => {
  test("the calendar, the date, the tag, then the controls and the search link", () => {
    const html = body(
      <DateStrip {...PROPS}>
        <button type="button">menu</button>
      </DateStrip>,
    );
    expect(html).toStartWith('<div class="DateStrip"><div class="DateStrip-when">');
    expect(html).toContain(
      '<span class="DateStrip-calendar" aria-hidden="true"><span class="DateStrip-month">Nov</span><span class="DateStrip-day">19</span></span>',
    );
    expect(html).toContain(
      '<time class="DateStrip-date" datetime="2026-11-19">Thursday, November 19, 2026</time><span class="DateStrip-line">No. 323. Sea state: choppy.</span>',
    );
    expect(html).toContain(
      '<strong class="DateStrip-count">16 waves up</strong><span class="DateStrip-note">5 new today, scanned 14:00</span><span class="DateStrip-short">5 new today</span>',
    );
    expect(html).toContain(
      '<div class="DateStrip-controls"><button type="button">menu</button><a class="DateStrip-search" href="/search">',
    );
    expect(html).toContain('<span class="DateStrip-search-name">Search</span></a></div></div>');
    expect(html).not.toContain("style=");
  });

  test("its text is text", () => {
    const html = body(
      <DateStrip {...PROPS} count="<b>1</b>" search={{ href: '/s?q="x"', label: "&" }} />,
    );
    expect(html).toContain("&lt;b>1&lt;/b>");
    expect(html).toContain('href="/s?q=&quot;x&quot;"');
    expect(html).not.toContain("<b>");
  });

  test("every state renders its controls: the language menu and the theme switch island", () => {
    for (const [name, props] of Object.entries(stripStates.states)) {
      const html = body(<DateStrip {...props} />);
      expect({ name, menu: html.includes('class="LanguageMenu"') }).toEqual({ name, menu: true });
      expect({ name, island: html.includes('<bd-island name="ThemeSwitch"') }).toEqual({
        name,
        island: true,
      });
    }
  });

  test("on phones the date is clipped, not removed, and the tag shows its short line", () => {
    const css = stripCss;
    const block = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      return css.slice(at, css.indexOf("\n  }", at));
    };
    expect(block(".DateStrip-text")).toContain("clip-path: inset(50%)");
    expect(block(".DateStrip-text")).not.toMatch(/display:\s*none/);
    expect(block(".DateStrip-note")).toMatch(/display:\s*none/);
    expect(block(".DateStrip-search-name")).toContain("clip-path: inset(50%)");
  });
});
