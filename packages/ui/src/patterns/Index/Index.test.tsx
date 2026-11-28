/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { renderDocument } from "../../runtime/index.ts";
import { INDEX_PHONE_ROWS } from "../../tokens/index.ts";
import type { IndexRowProps } from "../IndexRow/IndexRow.tsx";
import Index, { type IndexProps } from "./Index.island.tsx";
import indexStates from "./Index.states.tsx";

// The index's styles and their tests: `packages/ui/src/styles/styles.test.ts`.
// The button's click is the browser's: verify-local drives it on a phone width.

const rows = (count: number): IndexRowProps[] =>
  Array.from({ length: count }, (_, k) => ({
    href: `/topic/w${k + 1}`,
    rank: k + 1,
    title: { lang: "en", text: `Wave ${k + 1}` },
    height: 200 - k * 10,
    formedToday: k === 1,
    change: k === 1 ? "new" : "+1%",
  }));

const props = (count: number, over: Partial<IndexProps> = {}): IndexProps => ({
  id: "index",
  name: "The index",
  order: "by height",
  rows: rows(count),
  note: "Red numbers formed today.",
  showAll: `Show all ${count} waves`,
  showFewer: `Show the top ${INDEX_PHONE_ROWS}`,
  ...over,
});

const html = (p: IndexProps) => renderDocument(<Index {...p} />).replace("<!doctype html>", "");

describe("the index", () => {
  test("an island around an aside named by its heading, every row in order, then the key", () => {
    const out = html(props(3));
    expect(out).toStartWith('<bd-island name="Index" props="');
    expect(out).toContain(
      '<aside class="Index" aria-labelledby="index-name"><div class="Index-head">' +
        '<h2 id="index-name" class="Index-name">The index</h2>' +
        '<span class="Index-order">by height</span></div>' +
        '<ol id="index-list" class="Index-list">',
    );
    const hrefs = [...out.matchAll(/<li class="Index-item"><a class="IndexRow" href="([^"]+)"/g)];
    expect(hrefs.map((m) => m[1])).toEqual(["/topic/w1", "/topic/w2", "/topic/w3"]);
    expect(out).toContain('</ol><p class="Index-note">Red numbers formed today.</p></aside>');
  });

  test("up to INDEX_PHONE_ROWS rows, no button", () => {
    expect(html(props(INDEX_PHONE_ROWS))).not.toContain("<button");
  });

  test("more rows than that: a button that shows them all, on the list it controls", () => {
    const out = html(props(16));
    expect(out).toContain(
      '<button type="button" class="Index-more" aria-controls="index-list" aria-expanded="false">Show all 16 waves</button>',
    );
    expect(out.match(/<li /g)).toHaveLength(16);
  });

  test("open: every row shows on phones and the button says it shows fewer", () => {
    const out = html(props(16, { open: true }));
    expect(out).toContain('<ol id="index-list" class="Index-list Index-open">');
    expect(out).toContain('aria-expanded="true">Show the top 8</button>');
  });

  test("the catalog states", () => {
    expect(Object.keys(indexStates.states)).toEqual([
      "default",
      "open",
      "quiet",
      "long",
      "zh",
      "ja",
    ]);
    for (const p of Object.values(indexStates.states)) {
      expect(html(p).match(/<li /g)).toHaveLength(p.rows.length);
    }
  });
});
