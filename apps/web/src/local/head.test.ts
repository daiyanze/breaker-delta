import { afterAll, describe, expect, test } from "bun:test";
import { createFixtureReadQueries, FIXTURE_SET_NAMES } from "@bd/fixtures";
import { buildClient } from "@bd/ui/build";
import { fontLoading, uiCss } from "@bd/ui/styles";
import { CLIENT, HEAD_STYLES } from "../core/layout.ts";
import { handle } from "../select.ts";
import { startSite } from "./server.ts";

/** Every page the site renders: the placeholder, and each fixture set in each language. */
async function pages(): Promise<{ name: string; html: string }[]> {
  const out = [
    { name: "placeholder", html: await (await handle(new Request("http://x/"), {})).text() },
  ];
  for (const set of FIXTURE_SET_NAMES) {
    const { languages } = await createFixtureReadQueries(set).siteMeta();
    for (const lang of languages) {
      const res = await handle(new Request(`http://x/?lang=${lang}`), {
        READ_SOURCE: "fixtures",
        FIXTURE_SET: set,
      });
      out.push({ name: `${set} ${lang}`, html: await res.text() });
    }
  }
  return out;
}

interface Head {
  styles: number;
  inlineStyle: number;
  stylesheets: string[];
  fontPreloads: string[];
}

/** What a page's `<head>` loads, read with an HTML parser (Bun's HTMLRewriter). */
async function head(html: string): Promise<Head> {
  const found: Head = { styles: 0, inlineStyle: 0, stylesheets: [], fontPreloads: [] };
  const rewriter = new HTMLRewriter()
    .on("style", {
      element() {
        found.styles += 1;
      },
    })
    .on("[style]", {
      element() {
        found.inlineStyle += 1;
      },
    })
    .on("head link", {
      element(el) {
        const rel = el.getAttribute("rel");
        const href = el.getAttribute("href") ?? "";
        if (rel === "stylesheet") found.stylesheets.push(href);
        if (rel === "preload" && el.getAttribute("as") === "font") found.fontPreloads.push(href);
      },
    });
  await rewriter.transform(new Response(html)).text();
  return found;
}

describe("every page links the stylesheet (ADR 0020, section 4)", () => {
  test("no page holds a <style> or a style attribute, and each links /client/ui.css", async () => {
    for (const { name, html } of await pages()) {
      const h = await head(html);
      expect({ name, ...h, fontPreloads: [] }).toEqual({
        name,
        styles: 0,
        inlineStyle: 0,
        stylesheets: [CLIENT.css],
        fontPreloads: [],
      });
      expect(html).not.toContain("<style");
    }
  });

  test("fonts are preloaded in every head and never swapped in late", async () => {
    for (const { name, html } of await pages()) {
      expect({ name, problems: fontLoading(uiCss(), (await head(html)).fontPreloads) }).toEqual({
        name,
        problems: [],
      });
    }
  });

  test("a missing preload is reported", async () => {
    const { fontPreloads } = await head(`<head>${HEAD_STYLES}</head>`);
    const missing = fontPreloads.slice(1);
    expect(fontLoading(uiCss(), missing)).toEqual([`${fontPreloads[0]} is not preloaded`]);
  });
});

describe("/client/ on local mode", () => {
  const site = startSite({ port: 0, vars: {} });
  afterAll(() => site.stop());

  test("serves ui.css as built, with a type and an ETag", async () => {
    const res = await fetch(`${site.url}${CLIENT.css}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const [built] = await buildClient();
    expect(await res.text()).toBe(new TextDecoder().decode(built?.body));
    const etag = res.headers.get("etag") ?? "";
    expect(etag).toMatch(/^"\w+"$/);
    const again = await fetch(`${site.url}${CLIENT.css}`, { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
  });

  test("an unknown client file is a 404", async () => {
    expect((await fetch(`${site.url}/client/nope.js`)).status).toBe(404);
    expect((await fetch(`${site.url}/client/constructor`)).status).toBe(404);
  });
});
