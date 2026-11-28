/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import indexRowStates from "./IndexRow.states.tsx";
import { IndexRow, type IndexRowProps } from "./IndexRow.tsx";

// The row's styles and their tests: `packages/ui/src/styles/styles.test.ts`.

function renderToString(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

const row = (over: Partial<IndexRowProps> = {}): IndexRowProps => ({
  href: "/topic/a",
  rank: 3,
  title: { lang: "en", text: "Six banks offline" },
  height: 170.6,
  formedToday: false,
  change: "+12%",
  ...over,
});

describe("an index row", () => {
  test("one link to the topic page: rank, title, leader, change, height", () => {
    expect(renderToString(<IndexRow {...row()} />)).toBe(
      '<a class="IndexRow" href="/topic/a">' +
        '<span class="IndexRow-rank">3</span>' +
        '<span class="IndexRow-title" lang="en">Six banks offline</span>' +
        '<span class="IndexRow-leader" aria-hidden="true"></span>' +
        '<span class="IndexRow-change">+12%</span>' +
        '<data class="IndexRow-number" value="170.6">171</data></a>',
    );
  });

  test("formed today: the number and the change are red, nothing else", () => {
    const html = renderToString(<IndexRow {...row({ formedToday: true, change: "new" })} />);
    expect(html).toContain('<span class="IndexRow-change IndexRow-new">new</span>');
    expect(html).toContain('<data class="IndexRow-number IndexRow-new" value="170.6">');
    expect(html.match(/IndexRow-new/g)).toHaveLength(2);
  });

  test("a level wave shows no change", () => {
    expect(renderToString(<IndexRow {...row({ change: "" })} />)).toContain(
      '<span class="IndexRow-change"></span>',
    );
  });

  test("the title keeps its own language and is text", () => {
    const html = renderToString(<IndexRow {...row({ title: { lang: "ja", text: "<b>&" } })} />);
    expect(html).toContain('<span class="IndexRow-title" lang="ja">&lt;b>&amp;</span>');
  });

  test("every state renders one link", () => {
    for (const props of Object.values(indexRowStates.states)) {
      expect(renderToString(<IndexRow {...props} />).match(/<a /g)).toHaveLength(1);
    }
  });
});
