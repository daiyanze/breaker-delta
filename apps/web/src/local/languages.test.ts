import { describe, expect, test } from "bun:test";
import { createFixtureReadQueries, FIXTURE_SET_NAMES } from "@bd/fixtures";
import { handle } from "../select.ts";

// #107, per-language pages, through the site a visitor reaches: each
// acceptance criterion as a check over every fixture set and language.

const ORIGIN = "https://bd.test";
const VARS = { READ_SOURCE: "fixtures" };

/** A request as a browser sends it: from a link on this site, or arriving from elsewhere. */
function visit(path: string, opts: { from?: "site" | "outside"; accept?: string } = {}) {
  const headers: Record<string, string> = {
    "sec-fetch-site": opts.from === "outside" ? "cross-site" : "same-origin",
  };
  if (opts.accept !== undefined) headers["accept-language"] = opts.accept;
  return handle(new Request(new URL(path, ORIGIN), { headers }), VARS);
}

interface Read {
  lang: string | null;
  alternates: { hreflang: string; href: string }[];
  menu: { href: string; lang: string; current: boolean }[];
  topics: string[];
}

/** What a page says about its languages, read with an HTML parser. */
async function read(html: string): Promise<Read> {
  const found: Read = { lang: null, alternates: [], menu: [], topics: [] };
  await new HTMLRewriter()
    .on("html", {
      element(el) {
        found.lang = el.getAttribute("lang");
      },
    })
    .on('head link[rel="alternate"]', {
      element(el) {
        found.alternates.push({
          hreflang: el.getAttribute("hreflang") ?? "",
          href: el.getAttribute("href") ?? "",
        });
      },
    })
    .on("a.LanguageMenu-link", {
      element(el) {
        found.menu.push({
          href: el.getAttribute("href") ?? "",
          lang: el.getAttribute("hreflang") ?? "",
          current: el.getAttribute("aria-current") === "true",
        });
      },
    })
    .on('main a[href^="/"]', {
      element(el) {
        found.topics.push(el.getAttribute("href") ?? "");
      },
    })
    .transform(new Response(html))
    .text();
  return found;
}

/** Every page of every set in every enabled language: its path and its set's languages. */
async function everyPage() {
  const out: { path: string; lang: string; languages: string[]; defaultLanguage: string }[] = [];
  for (const set of FIXTURE_SET_NAMES) {
    const meta = await createFixtureReadQueries(set).siteMeta();
    for (const lang of meta.languages) {
      const prefix = lang === meta.defaultLanguage ? "/" : `/${lang}/`;
      out.push({ path: `${prefix}?set=${set}`, lang, ...meta });
    }
  }
  return out;
}

describe("hreflang for every enabled language plus x-default", () => {
  test("each page's head declares the page in each enabled language, then x-default", async () => {
    for (const page of await everyPage()) {
      const res = await visit(page.path);
      expect({ page: page.path, status: res.status }).toEqual({ page: page.path, status: 200 });
      const { lang, alternates } = await read(await res.text());
      expect(lang).toBe(page.lang);
      expect(alternates.map((a) => a.hreflang)).toEqual([...page.languages, "x-default"]);
      for (const a of alternates) expect(a.href).toStartWith(`${ORIGIN}/`);
    }
  });

  test("each alternate is that page in that language; x-default is the page without a prefix", async () => {
    for (const page of await everyPage()) {
      const { alternates } = await read(await (await visit(page.path)).text());
      for (const a of alternates) {
        const res = await visit(a.href);
        expect({ href: a.href, status: res.status }).toEqual({ href: a.href, status: 200 });
        const there = await read(await res.text());
        expect(there.lang).toBe(a.hreflang === "x-default" ? page.defaultLanguage : a.hreflang);
        expect(there.alternates).toEqual(alternates);
      }
    }
  });

  test("an install with one language still declares it and x-default", async () => {
    const { alternates, menu } = await read(await (await visit("/?set=quiet")).text());
    expect(alternates).toEqual([
      { hreflang: "en", href: `${ORIGIN}/?set=quiet` },
      { hreflang: "x-default", href: `${ORIGIN}/?set=quiet` },
    ]);
    expect(menu).toEqual([]);
  });
});

describe("switching language lands on the same page in the other language", () => {
  test("each menu link opens the same page in its language, with the same menu", async () => {
    let followed = 0;
    for (const page of await everyPage()) {
      const here = await read(await (await visit(page.path)).text());
      if (page.languages.length < 2) continue;
      expect(here.menu.map((l) => l.lang)).toEqual(page.languages);
      expect(here.menu.filter((l) => l.current).map((l) => l.lang)).toEqual([page.lang]);
      for (const link of here.menu) {
        const res = await visit(link.href);
        expect({ href: link.href, status: res.status }).toEqual({ href: link.href, status: 200 });
        const there = await read(await res.text());
        expect(there.lang).toBe(link.lang);
        // The same page: the same set of alternates, and the same menu with
        // the language clicked marked current.
        expect(there.alternates).toEqual(here.alternates);
        expect(there.menu.map((l) => l.href)).toEqual(here.menu.map((l) => l.href));
        expect(there.menu.find((l) => l.current)?.href).toBe(link.href);
        followed += 1;
      }
    }
    // busy and fresh: three pages, three links each.
    expect(followed).toBe(18);
  });

  test("links on a page stay in its language", async () => {
    const { topics } = await read(await (await visit("/zh/")).text());
    expect(topics.length).toBeGreaterThan(0);
    for (const href of topics) expect(href).toStartWith("/zh/topic/");
    const en = await read(await (await visit("/")).text());
    for (const href of en.topics) expect(href).toStartWith("/topic/");
  });

  test("choosing the default language from another one is not sent back by the browser's language", async () => {
    const res = await visit("/", { from: "site", accept: "ja" });
    expect(res.status).toBe(200);
    expect((await read(await res.text())).lang).toBe("en");
  });
});

describe("a visit without a language in the URL goes by the browser's language", () => {
  test("arriving at / with Japanese or Chinese first is sent to /ja/ or /zh/", async () => {
    for (const [accept, to] of [
      ["ja-JP,ja;q=0.9,en;q=0.8", "/ja/"],
      ["zh-CN,zh;q=0.9", "/zh/"],
      ["fr, zh-TW;q=0.5", "/zh/"],
    ] as const) {
      const res = await visit("/", { from: "outside", accept });
      expect({ accept, status: res.status, to: res.headers.get("location") }).toEqual({
        accept,
        status: 302,
        to,
      });
      expect(res.headers.get("vary")).toBe("Accept-Language, Sec-Fetch-Site");
    }
  });

  test("the query goes along", async () => {
    const res = await visit("/?set=fresh", { from: "outside", accept: "ja" });
    expect(res.headers.get("location")).toBe("/ja/?set=fresh");
  });

  test("English first, no match or no header: the English page, which says it varies", async () => {
    for (const accept of ["en-US,en;q=0.9,ja;q=0.8", "fr-FR", undefined]) {
      const res = await visit(
        "/",
        accept === undefined ? { from: "outside" } : { from: "outside", accept },
      );
      expect({ accept, status: res.status }).toEqual({ accept, status: 200 });
      expect(res.headers.get("vary")).toBe("Accept-Language, Sec-Fetch-Site");
      expect((await read(await res.text())).lang).toBe("en");
    }
  });

  test("a URL with a language is never redirected by the browser's", async () => {
    const res = await visit("/zh/", { from: "outside", accept: "ja" });
    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toBeNull();
    expect((await read(await res.text())).lang).toBe("zh");
  });

  test("an install with one language does not redirect", async () => {
    const res = await visit("/?set=quiet", { from: "outside", accept: "ja" });
    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toBeNull();
  });

  test("the default language's prefix, or one not enabled, goes to the page without it", async () => {
    for (const [path, to] of [
      ["/en/", "/"],
      ["/en/?set=fresh", "/?set=fresh"],
      ["/ja/?set=quiet", "/?set=quiet"],
    ] as const) {
      const res = await visit(path);
      expect({ path, status: res.status, to: res.headers.get("location") }).toEqual({
        path,
        status: 302,
        to,
      });
    }
  });

  test("a path no route has is a 404 in every language, not a redirect", async () => {
    for (const path of ["/nope", "/zh/nope"]) {
      expect((await visit(path, { from: "outside", accept: "ja" })).status).toBe(404);
    }
  });
});
