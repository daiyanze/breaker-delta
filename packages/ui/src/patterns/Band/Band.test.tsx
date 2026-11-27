/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument, states } from "../../runtime/index.ts";
import bandStates from "./Band.states.tsx";
import { Band } from "./Band.tsx";

// The band's styles and their tests: `packages/ui/src/styles/styles.test.ts`.
// Moved from `apps/web/src/core/layout.test.ts` (#271): the same landmark,
// ids, heading and text; the markup is Preact's, so no line breaks.

/** What the band renders to, through the one renderer the site uses. */
function renderToString(band: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {band}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

describe("band markup", () => {
  test("a band is a section named by its rail heading", () => {
    const html = renderToString(
      <Band id="tide" name="Tide table" note="What formed.">
        <p>x</p>
      </Band>,
    );
    expect(html).toStartWith('<section class="Band" aria-labelledby="band-tide">');
    expect(html).toContain(
      '<div class="Band-rail"><h2 id="band-tide" class="Band-name">Tide table</h2>',
    );
    expect(html).toContain('<p class="Band-note">What formed.</p>');
    expect(html).toContain('<div class="Band-body"><p>x</p></div>');
  });

  test("name and note are text, children are elements", () => {
    const html = renderToString(
      <Band id="a" name="<b>" note="&">
        <em>ok</em>
      </Band>,
    );
    expect(html).toContain("&lt;b></h2>");
    expect(html).toContain('<p class="Band-note">&amp;</p>');
    expect(html).toContain("<em>ok</em>");
  });

  test("no note, no empty paragraph", () => {
    expect(renderToString(<Band id="a" name="A" />)).not.toContain("Band-note");
  });
});

describe("band states", () => {
  test("every state renders a band", () => {
    for (const props of Object.values(bandStates.states)) {
      expect(renderToString(<Band {...props} />)).toStartWith('<section class="Band"');
    }
  });

  test("a state with a prop the band does not take is a compile error", () => {
    // @ts-expect-error `variant` is not a Band prop (NoInfer, ADR 0020 section 3).
    const wrong = states(Band, { x: { id: "a", name: "A", variant: "solid" } });
    expect(Object.keys(wrong.states)).toEqual(["x"]);
  });
});
