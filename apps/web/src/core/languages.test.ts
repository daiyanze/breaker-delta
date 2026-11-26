import { describe, expect, test } from "bun:test";
import { alternates, isArrival, locate, pathIn, preferredLanguage } from "./languages.ts";

const all = { languages: ["en", "zh", "ja"] as const, defaultLanguage: "en" as const };
const one = { languages: ["en"] as const, defaultLanguage: "en" as const };
const jaFirst = { languages: ["ja", "en"] as const, defaultLanguage: "ja" as const };
const site = (s: typeof all | typeof one | typeof jaFirst) => ({
  languages: [...s.languages],
  defaultLanguage: s.defaultLanguage,
});

describe("locate", () => {
  test("a path without a prefix is the default language", () => {
    expect(locate("/", site(all))).toEqual({
      kind: "page",
      lang: "en",
      path: "/",
      prefixed: false,
    });
    expect(locate("/topic/a", site(all))).toEqual({
      kind: "page",
      lang: "en",
      path: "/topic/a",
      prefixed: false,
    });
  });

  test("an enabled language's prefix is that language; its front page with or without the slash", () => {
    for (const p of ["/zh", "/zh/"]) {
      expect(locate(p, site(all))).toEqual({ kind: "page", lang: "zh", path: "/", prefixed: true });
    }
    expect(locate("/ja/topic/a", site(all))).toEqual({
      kind: "page",
      lang: "ja",
      path: "/topic/a",
      prefixed: true,
    });
  });

  test("the default language's prefix, or a language not enabled, redirects to the page without it", () => {
    expect(locate("/en/topic/a", site(all))).toEqual({ kind: "redirect", location: "/topic/a" });
    expect(locate("/ja/", site(one))).toEqual({ kind: "redirect", location: "/" });
    expect(locate("/ja/", site(jaFirst))).toEqual({ kind: "redirect", location: "/" });
  });

  test("a word that only starts like a language is a path", () => {
    expect(locate("/japan", site(all))).toMatchObject({ kind: "page", path: "/japan" });
    expect(locate("/fr/", site(all))).toMatchObject({ kind: "page", lang: "en", path: "/fr/" });
  });
});

describe("pathIn and alternates", () => {
  test("the default language has no prefix; every other one has its own", () => {
    expect(pathIn("/", "en", site(all))).toBe("/");
    expect(pathIn("/", "zh", site(all))).toBe("/zh/");
    expect(pathIn("/topic/a", "ja", site(all))).toBe("/ja/topic/a");
    expect(pathIn("/", "en", site(jaFirst))).toBe("/en/");
    expect(pathIn("/", "ja", site(jaFirst))).toBe("/");
  });

  test("every enabled language, then x-default, as absolute URLs", () => {
    expect(alternates("/topic/a", "https://bd.test", site(all))).toEqual([
      { hreflang: "en", href: "https://bd.test/topic/a" },
      { hreflang: "zh", href: "https://bd.test/zh/topic/a" },
      { hreflang: "ja", href: "https://bd.test/ja/topic/a" },
      { hreflang: "x-default", href: "https://bd.test/topic/a" },
    ]);
    expect(alternates("/", "https://bd.test", site(one))).toEqual([
      { hreflang: "en", href: "https://bd.test/" },
      { hreflang: "x-default", href: "https://bd.test/" },
    ]);
  });

  test("the language of a path built by pathIn is read back by locate", () => {
    for (const s of [site(all), site(jaFirst)]) {
      for (const lang of s.languages) {
        for (const path of ["/", "/topic/a"]) {
          expect(locate(pathIn(path, lang, s), s)).toMatchObject({ kind: "page", lang, path });
        }
      }
    }
  });
});

describe("preferredLanguage", () => {
  const pick = (header: string | null, s = site(all)) => preferredLanguage(header, s);

  test("the browser's first enabled language, by primary subtag", () => {
    expect(pick("ja-JP,ja;q=0.9,en-US;q=0.8")).toBe("ja");
    expect(pick("zh-TW")).toBe("zh");
    expect(pick("zh-Hans-CN, en;q=0.5")).toBe("zh");
    expect(pick("fr-FR, de;q=0.9, ja;q=0.3")).toBe("ja");
  });

  test("q values rank, ties keep their order, q=0 excludes", () => {
    expect(pick("en;q=0.4, zh;q=0.8")).toBe("zh");
    expect(pick("zh;q=0.5, ja;q=0.5")).toBe("zh");
    expect(pick("ja;q=0, zh;q=0.1")).toBe("zh");
  });

  test("the default when nothing matches, on *, a missing header, or a language not enabled", () => {
    expect(pick(null)).toBe("en");
    expect(pick("")).toBe("en");
    expect(pick("fr, de")).toBe("en");
    expect(pick("*, ja")).toBe("en");
    expect(pick("ja", site(one))).toBe("en");
  });
});

describe("isArrival", () => {
  const req = (site?: string) =>
    new Request("http://x/", site === undefined ? {} : { headers: { "sec-fetch-site": site } });

  test("a link followed on this site is not an arrival; anything else is", () => {
    expect(isArrival(req("same-origin"))).toBe(false);
    for (const s of ["cross-site", "same-site", "none", undefined])
      expect(isArrival(req(s))).toBe(true);
  });
});
