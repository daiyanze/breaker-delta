import { afterAll, describe, expect, test } from "bun:test";
import { CATALOG, THEMES } from "@bd/ui/catalog";
import { CATALOG_PATH, catalogHref, LANGUAGES } from "./catalog.tsx";
import { startSite } from "./server.ts";

// `/_catalog` (#258): a route of the local adapter only. The Cloudflare
// adapter's 404 is in `../cloudflare/worker.test.ts`.
const site = startSite({ port: 0, vars: {} });
afterAll(() => site.stop());

const get = (path: string) => fetch(`${site.url}${path}`);

describe("/_catalog", () => {
  test("is in every theme and language: light, dark; en, zh, ja", () => {
    expect(THEMES).toEqual(["light", "dark"]);
    expect(LANGUAGES).toEqual(["en", "zh", "ja"]);
  });

  test("lists every component with every declared state, on each theme and language", async () => {
    for (const theme of THEMES) {
      for (const lang of LANGUAGES) {
        const res = await get(catalogHref(theme, lang));
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain(`<html lang="${lang}" data-theme="${theme}">`);
        for (const e of CATALOG) {
          expect(html).toContain(`<h2 id="catalog-${e.name}">${e.name}</h2>`);
          for (const state of e.states) expect(html).toContain(`data-shot="${e.name}/${state}"`);
        }
        // Links to every other theme and language.
        for (const t of THEMES) {
          for (const l of LANGUAGES) {
            expect(html).toContain(`href="${catalogHref(t, l).replaceAll("&", "&amp;")}"`);
          }
        }
      }
    }
  });

  test("defaults to light and English, and lists every component's states", async () => {
    const html = await (await get(CATALOG_PATH)).text();
    expect(html).toContain('<html lang="en" data-theme="light">');
    expect(html).toContain("ThemeSwitch</a> (primitives): default, long, zh, ja");
    expect(html).toContain("Band</a> (patterns): default, note, long, zh, ja");
    expect(html).toContain("LanguageMenu</a> (patterns): default, open, long, zh, ja");
  });

  test("its own text is in the page's language, from the string tables", async () => {
    const en = await (await get(catalogHref("light", "en"))).text();
    expect(en).toContain("<h1>Catalog</h1>");
    expect(en).toContain("This page: light, en.");
    expect(en).toContain("<p>patterns, 5 states</p>");
    const ja = await (await get(catalogHref("dark", "ja"))).text();
    expect(ja).toContain("<title>カタログ</title>");
    expect(ja).toContain("<h1>カタログ</h1>");
    expect(ja).toContain("このページ：dark、ja。");
    const zh = await (await get(catalogHref("light", "zh"))).text();
    expect(zh).toContain("<h1>组件目录</h1>");
    expect(zh).toContain("<p>patterns，5 种状态</p>");
  });

  test("&shot= serves one state alone, for the screenshot run", async () => {
    for (const e of CATALOG) {
      for (const state of e.states) {
        const html = await (await get(catalogHref("dark", "zh", `${e.name}/${state}`))).text();
        expect(html).toContain('<html lang="zh" data-theme="dark">');
        expect(html.match(/data-shot=/g)).toEqual(["data-shot="]);
        expect(html).toContain(`data-shot="${e.name}/${state}"`);
      }
    }
    for (const shot of ["Band/nope", "Nope/default", "Band"]) {
      expect((await get(catalogHref("light", "en", shot))).status).toBe(404);
    }
  });

  test("an unknown theme or language is a 404", async () => {
    expect((await get(`${CATALOG_PATH}?theme=sepia`)).status).toBe(404);
    expect((await get(`${CATALOG_PATH}?lang=fr`)).status).toBe(404);
  });

  test("islands in the catalog are rendered for the loader the page links", async () => {
    const html = await (await get(CATALOG_PATH)).text();
    expect(html).toContain('<bd-island name="ThemeSwitch"');
    expect((await get("/client/ThemeSwitch.island.js")).status).toBe(200);
  });
});
