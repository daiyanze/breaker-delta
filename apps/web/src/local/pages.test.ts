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
