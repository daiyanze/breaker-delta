/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import fadingStates from "./FadingNotices.states.tsx";
import { FadingNotices, type FadingNoticesProps } from "./FadingNotices.tsx";

/** What the section renders to, through the one renderer the site uses. */
function html(node: VNode): string {
  const page = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return page.slice(page.indexOf("<body>") + 6, page.indexOf("</body>"));
}

function state(name: string): FadingNoticesProps {
  const props = fadingStates.states[name];
  if (props === undefined) throw new Error(`the ${name} state`);
  return props;
}

describe("fading notices", () => {
  test("a band: the rail's note, link and sunset, then a list of notices", () => {
    const out = html(<FadingNotices {...state("default")} />);
    expect(out).toStartWith('<section class="Band" aria-labelledby="band-fading">');
    expect(out).toContain(
      '<h2 id="band-fading" class="Band-name">Fading notices</h2><p class="Band-note">With nothing new',
    );
    expect(out).toContain(
      '<div class="FadingNotices-rail"><a class="FadingNotices-flat" href="/changes?type=went_flat">Read the 12 that went flat</a><svg class="FadingNotices-sunset" viewBox="0 0 240 120" role="img" aria-label="The sun setting over a flat sea">',
    );
    expect(out).toContain(
      '<div class="Band-body"><div class="FadingNotices"><ul class="FadingNotices-list">',
    );
    expect(out.match(/<li class="FadingNotices-item"><article class="Notice">/g)?.length).toBe(4);
    expect(out).not.toContain("style=");
  });

  test("no link when no wave went flat", () => {
    const out = html(<FadingNotices {...state("one")} />);
    expect(out).not.toContain("FadingNotices-flat");
    expect(out).toContain('<div class="FadingNotices-rail"><svg class="FadingNotices-sunset"');
    expect(out.match(/<article class="Notice">/g)?.length).toBe(1);
  });

  test("with no wave going out, the whole section is one sentence", () => {
    const out = html(<FadingNotices {...state("none")} />);
    expect(out).toBe(
      '<section class="Band" aria-labelledby="band-fading"><div class="Band-rail"><h2 id="band-fading" class="Band-name">Fading notices</h2></div><div class="Band-body"><div class="FadingNotices"><p class="FadingNotices-none">No wave is going out.</p></div></div></section>',
    );
  });

  test("its states: default, one, none, long, zh, ja", () => {
    expect(Object.keys(fadingStates.states)).toEqual([
      "default",
      "one",
      "none",
      "long",
      "zh",
      "ja",
    ]);
  });

  test("every state renders the section", () => {
    for (const props of Object.values(fadingStates.states)) {
      expect(html(<FadingNotices {...props} />)).toStartWith(
        '<section class="Band" aria-labelledby="band-fading">',
      );
    }
  });
});
