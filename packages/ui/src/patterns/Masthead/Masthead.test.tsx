/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Document, renderDocument } from "../../runtime/index.ts";
import mastheadStates from "./Masthead.states.tsx";
import { Masthead, type MastheadProps } from "./Masthead.tsx";

function body(node: VNode): string {
  const html = renderDocument(
    <Document lang="en" title="T">
      {node}
    </Document>,
  );
  return html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
}

function state(name: string): MastheadProps {
  const props = mastheadStates.states[name];
  if (props === undefined) throw new Error(`the ${name} state`);
  return props;
}

describe("masthead", () => {
  test("one link home holds the mark and the wordmark; the mark is decorative", () => {
    const html = body(<Masthead {...state("default")} />);
    expect(html).toStartWith(
      '<div class="Masthead"><div class="Masthead-row"><div class="Masthead-title"><a class="Masthead-home" href="/"><svg class="Masthead-mark" viewBox="0 0 512 512" aria-hidden="true">',
    );
    expect(html).toContain('</svg><span class="Masthead-name">Breaker Delta</span></a>');
    expect(html.match(/class="Masthead-home"/g)?.length).toBe(1);
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("style=");
  });

  test("on the front page the wordmark is the page's heading", () => {
    const html = body(<Masthead {...state("default")} heading />);
    expect(html).toContain('<h1 class="Masthead-title"><a class="Masthead-home" href="/">');
    expect(html).toContain("Breaker Delta</span></a></h1>");
  });

  test("the navigation and the phone list hold the same links, the current page marked in each", () => {
    const html = body(<Masthead {...state("current")} />);
    expect(html).toContain('<nav class="Masthead-nav" aria-label="Main">');
    expect(html).toContain(
      '<a class="Masthead-link" href="/record" aria-current="page">Track record</a>',
    );
    expect(html).toContain(
      '<a class="Masthead-item" href="/record" aria-current="page">Track record</a>',
    );
    expect(html).toContain('<a class="Masthead-link" href="/">Front page</a>');
    expect(html.match(/aria-current/g)?.length).toBe(2);
    expect(html.match(/class="Masthead-link"/g)?.length).toBe(6);
    expect(html.match(/class="Masthead-item"/g)?.length).toBe(6);
  });

  test("on phones the links are in a disclosure, closed unless told to start open", () => {
    expect(body(<Masthead {...state("default")} />)).toContain(
      '<details class="Masthead-sections"><summary class="Masthead-button">Sections<svg',
    );
    expect(body(<Masthead {...state("open")} />)).toContain(
      '<details class="Masthead-sections" open>',
    );
  });

  test("the tools row is there only when the page gives tools", () => {
    expect(body(<Masthead {...state("default")} />)).not.toContain("Masthead-tools");
    const html = body(<Masthead {...state("tools")} />);
    expect(html).toStartWith(
      '<div class="Masthead"><div class="Masthead-tools"><div class="LanguageMenu">',
    );
    expect(html).toContain('<bd-island name="ThemeSwitch"');
  });

  test("the wave and the boat are hidden from assistive technology", () => {
    const html = body(<Masthead {...state("default")} />);
    expect(html).toContain(
      '<div class="Masthead-wave" aria-hidden="true"><svg class="Masthead-sea"',
    );
    expect(html).toContain('<path class="Masthead-swell" d="M-240,34 q15,-8 30,0 t30,0');
  });

  test("the wave reaches past the widest page plus its drift, so it never shows an end", () => {
    const d = /class="Masthead-swell" d="([^"]+)"/.exec(
      body(<Masthead {...state("default")} />),
    )?.[1];
    const periods = (d?.match(/ q15,-8 30,0 t30,0/g) ?? []).length;
    // From x = -240, 60 a period: past the 1280 view box after drifting 240.
    expect(-240 + periods * 60).toBeGreaterThanOrEqual(1280 + 240);
  });

  test("text is text", () => {
    const html = body(
      <Masthead
        home="/?a=1&b=2"
        name="<b>"
        navLabel={'"x'}
        sectionsLabel="<i>"
        links={[{ href: "/", label: "<u>", current: true }]}
      />,
    );
    expect(html).toContain('href="/?a=1&amp;b=2"');
    expect(html).toContain('<span class="Masthead-name">&lt;b></span>');
    expect(html).toContain('aria-label="&quot;x"');
    expect(html).toContain(">&lt;i><svg");
    expect(html).toContain(">&lt;u></a>");
  });

  test("its states: default, current, open, tools, long, zh, ja", () => {
    expect(Object.keys(mastheadStates.states)).toEqual([
      "default",
      "current",
      "open",
      "tools",
      "long",
      "zh",
      "ja",
    ]);
    for (const name of Object.keys(mastheadStates.states)) {
      const props = state(name);
      expect(props.links.filter((l) => l.current === true)).toHaveLength(1);
    }
  });
});
// Its stylesheet's rules: `src/styles/masthead.test.ts`.
