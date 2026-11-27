/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import searchStates from "./SearchEntry.states.tsx";
import { SearchEntry } from "./SearchEntry.tsx";

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

describe("search entry (issue 112)", () => {
  test("a secondary button linking to the search page, its label as its text", () => {
    const html = body(<SearchEntry href="/zh/search" label="搜索" />);
    expect(html).toStartWith(
      '<span class="SearchEntry"><a class="Button" href="/zh/search" data-variant="secondary"><svg class="Button-icon"',
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toEndWith('<span class="SearchEntry-label">搜索</span></a></span>');
    expect(html).not.toContain("aria-label");
  });

  test("its states: default, long, zh, ja", () => {
    expect(Object.keys(searchStates.states)).toEqual(["default", "long", "zh", "ja"]);
  });
});
