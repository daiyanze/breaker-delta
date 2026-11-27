import { describe, expect, test } from "bun:test";
import { PHONE, TWO_COLUMNS_FROM } from "@bd/ui/tokens";
import { renderBand, renderPage } from "./layout.ts";
import { headStyles } from "./style.ts";

const css = headStyles();

/** The rule for `selector` at the top level, and the one inside the two-column query. */
function rules(selector: string): { base: string; wide: string } {
  const media = `@media (min-width:${TWO_COLUMNS_FROM}){`;
  const base: string[] = [];
  const wide: string[] = [];
  for (const line of css.split("\n")) {
    const target = line.startsWith(media) ? wide : base;
    for (const m of line.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (m[1]?.trim() === selector) target.push(m[2] ?? "");
    }
  }
  return { base: base.join(";"), wide: wide.join(";") };
}

describe("band markup", () => {
  test("a band is a section named by its rail heading", () => {
    const html = renderBand({
      id: "tide",
      name: "Tide table",
      note: "What formed.",
      content: "<p>x</p>",
    });
    expect(html).toStartWith('<section class="band" aria-labelledby="band-tide">');
    expect(html).toContain(
      '<div class="band-rail">\n<h2 id="band-tide" class="band-name">Tide table</h2>',
    );
    expect(html).toContain('<p class="band-note">What formed.</p>');
    expect(html).toContain('<div class="band-body">\n<p>x</p>\n</div>');
  });

  test("name and note are escaped, content is not", () => {
    const html = renderBand({ id: "a", name: "<b>", note: "&", content: "<em>ok</em>" });
    expect(html).toContain("&#60;b&#62;</h2>");
    expect(html).toContain('<p class="band-note">&#38;</p>');
    expect(html).toContain("<em>ok</em>");
  });

  test("no note, no empty paragraph", () => {
    expect(renderBand({ id: "a", name: "A", content: "" })).not.toContain("band-note");
  });

  test("a page puts its heading and every band inside the page width", () => {
    const html = renderPage({
      lang: "ja",
      title: "T",
      heading: "H",
      bands: [
        { id: "a", name: "A", content: "" },
        { id: "b", name: "B", content: "" },
      ],
    });
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<header class="page">\n<h1>H</h1>\n</header>');
    const main = html.slice(html.indexOf('<main class="page">'), html.indexOf("</main>"));
    expect(main.match(/<section class="band"/g)?.length).toBe(2);
  });
});

describe("layout styles", () => {
  test("the page is at most `content` wide with the side margins outside it", () => {
    const { base } = rules(".page");
    expect(base).toContain("box-sizing:content-box");
    expect(base).toContain("max-width:var(--content)");
    expect(base).toContain("padding-inline:var(--page-gutter)");
  });

  test("phones get one column and a static rail; wide screens two columns and a sticky rail", () => {
    expect(rules(".band").base).toContain("grid-template-columns:minmax(0,1fr)");
    expect(rules(".band-rail").base).not.toContain("sticky");
    expect(rules(".band").wide).toContain(
      "grid-template-columns:minmax(0,var(--rail)) minmax(0,1fr);column-gap:var(--space-8)",
    );
    expect(rules(".band-rail").wide).toContain("position:sticky");
  });

  test("bands are separated by a thin ink rule and the band spacing", () => {
    const { base } = rules(".band");
    expect(base).toContain("border-top:var(--rule-thin) solid var(--ink)");
    expect(base).toContain("padding-block:var(--band-space)");
    const root = rules(":root");
    expect(root.base).toContain("--band-space:var(--space-7)");
    expect(root.wide).toContain("--band-space:var(--space-8)");
    expect(root.wide).toContain("--page-gutter:var(--space-6)");
    expect(root.wide).toContain("--band-name-size:var(--type-section-size)");
  });

  // That they are the values the design states: `packages/ui/src/tokens/tokens.test.ts`.
  test("phones get the phone values", () => {
    const root = rules(":root").base;
    expect(root).toContain(`--page-gutter:${PHONE.gutter.value}`);
    expect(root).toContain(`--band-name-size:${PHONE.sectionSize.value}`);
  });

  test("no layout rule sets a fixed width that could overflow a phone", () => {
    for (const sel of [".page", ".band", ".band-rail", ".band-body", ".band-name"]) {
      const { base, wide } = rules(sel);
      expect(`${base};${wide}`).not.toMatch(/(?:^|;)(?:min-)?width:[1-9]/);
    }
  });
});
