/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import filtersStates from "./Filters.states.tsx";
import { Filters } from "./Filters.tsx";

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

describe("filters (issue 112)", () => {
  test("a named row of links, the current one the page itself", () => {
    const html = body(
      <Filters
        label="Filter"
        items={[
          { href: "/changes", label: "Everything", current: false },
          { href: "/changes?type=new&x=1", label: "New waves", current: true },
        ]}
      />,
    );
    expect(html).toBe(
      '<nav class="Filters" aria-label="Filter">' +
        '<a class="Filters-item" href="/changes">Everything</a>' +
        '<a class="Filters-item" href="/changes?type=new&amp;x=1" aria-current="page">New waves</a>' +
        "</nav>",
    );
  });

  test("every state marks exactly one item current, each with its own URL", () => {
    expect(Object.keys(filtersStates.states)).toEqual(["default", "counts", "long", "zh", "ja"]);
    for (const props of Object.values(filtersStates.states)) {
      const html = body(<Filters {...props} />);
      expect(html.match(/aria-current="page"/g)?.length).toBe(1);
      const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});
