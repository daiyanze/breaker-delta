import { describe, expect, test } from "bun:test";
import { renderBand, renderPage } from "./layout.ts";

// The band's styles and their tests: `packages/ui/src/styles/styles.test.ts`.
// The page head against the stylesheet: `apps/web/src/local/head.test.ts`.

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
