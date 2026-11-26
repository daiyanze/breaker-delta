import { describe, expect, test } from "bun:test";
import { createFixtureReadQueries } from "@bd/fixtures";
import { createSite, renderFront } from "../core/site.ts";

// The site core cannot import fixtures (check-deps), so the pages it renders
// from fixture data are checked here.
describe("every page uses the band", () => {
  const pages = async () => {
    const placeholder = await createSite(() => null).fetch(new Request("http://x/"));
    return {
      placeholder: await placeholder.text(),
      busy: await renderFront(createFixtureReadQueries("busy"), null),
      fresh: await renderFront(createFixtureReadQueries("fresh"), null),
    };
  };

  test("all page content sits in bands inside the page width", async () => {
    for (const [name, html] of Object.entries(await pages())) {
      const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).trim();
      const outside = body
        .replace(/<header class="page">[\s\S]*?<\/header>/, "")
        .replace(
          /<main class="page">\n(?:<section class="band"[\s\S]*?<\/section>\n?)+<\/main>/,
          "",
        )
        .trim();
      expect({ name, outside }).toEqual({ name, outside: "" });
    }
  });

  test("the busy front page has the front page and classifieds bands", async () => {
    const { busy } = await pages();
    expect(busy).toContain('aria-labelledby="band-front"');
    expect(busy).toContain('aria-labelledby="band-classifieds"');
    expect(busy).toContain("edition. Sea state");
  });
});

// #46: a model-written headline that holds markup renders as text. The
// pipeline refuses such text before storing it (`writesNoMarkup`); this is
// the second guard, at render.
describe("model text renders as text", () => {
  test("a headline with markup adds no element and no link", async () => {
    const base = createFixtureReadQueries("busy");
    const plain = await base.edition();
    if (plain === null) throw new Error("busy has an edition");
    const injected = [
      '<a href="javascript:alert(1)">x</a>',
      "<img src=x onerror=alert(1)>",
      "</a><script>alert(1)</script>",
      '" onmouseover="alert(1)',
    ];
    const ranking = plain.ranking.map((row, i) => ({
      ...row,
      headlines: row.headlines.map((h) => ({ ...h, text: injected[i % injected.length] ?? "" })),
    }));
    const q = { ...base, edition: async () => ({ ...plain, ranking }) };
    const html = await renderFront(q, "en");
    const before = await renderFront(base, "en");
    const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
    expect(count(html, /<a\b/g)).toBe(count(before, /<a\b/g));
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html.slice(html.indexOf("<main"))).not.toMatch(/href="(?!\/topic\/|https:\/\/)/);
    expect(html).not.toContain('" onmouseover');
    expect(html).toContain("&#60;img src=x onerror=alert(1)&#62;");
  });
});
