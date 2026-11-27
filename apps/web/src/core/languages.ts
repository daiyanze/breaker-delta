/**
 * Which language a URL is in, and where the same page is in another one
 * (#107). Each enabled language has its own pages; the enabled languages
 * and the default come from the settings, through `SiteMeta`.
 *
 * URL shape: the default language has no prefix, so `/` stays the English
 * front page by default (ADR 0015); every other enabled language is a
 * prefix: `/zh/`, `/ja/topic/<slug>`. A prefix naming the default language
 * or a language that is not enabled redirects to the page without it.
 *
 * A visit from outside the site to a page without a prefix is sent to the
 * language the browser asks for first (`Accept-Language`), when that is
 * another enabled language. A link followed inside the site
 * (`Sec-Fetch-Site: same-origin`) is not, so choosing the default language
 * in the language menu lands on it and stays there. No cookie: the design
 * system lets only Google Analytics set one.
 */
import { type Language, LanguageSchema, type SiteMeta } from "@bd/contracts";

export type Languages = Pick<SiteMeta, "languages" | "defaultLanguage">;

/** A URL path read for its language: the page, or the URL it moves to. */
export type Located =
  | { kind: "page"; lang: Language; path: string; prefixed: boolean }
  | { kind: "redirect"; location: string };

const PREFIX = new RegExp(`^/(${LanguageSchema.options.join("|")})(/.*)?$`);

/** The language of `pathname` and its path without the language. */
export function locate(pathname: string, site: Languages): Located {
  const m = PREFIX.exec(pathname);
  if (m === null)
    return { kind: "page", lang: site.defaultLanguage, path: pathname, prefixed: false };
  const lang = m[1] as Language;
  const path = m[2] ?? "/";
  if (lang === site.defaultLanguage || !site.languages.includes(lang)) {
    return { kind: "redirect", location: sitePath(path) };
  }
  return { kind: "page", lang, path, prefixed: true };
}

/**
 * `path` with exactly one leading slash, so a `Location` built from it is a
 * path on this site: `//host` or `/\host` would name another host (review
 * of #278). The URL parser has already turned `\` into `/` and keeps `%2F`
 * encoded, so leading slashes are all there is to collapse.
 */
export function sitePath(path: string): string {
  return `/${path.replace(/^[/\\]+/, "")}`;
}

/** True for a path on this site: one `/`, then anything but another `/` or `\`. */
export function isSitePath(location: string): boolean {
  return /^\/(?![/\\])/.test(location);
}

/** The path of the page at `path` (without a language) in `lang`. */
export function pathIn(path: string, lang: Language, site: Languages): string {
  if (lang === site.defaultLanguage) return path;
  return path === "/" ? `/${lang}/` : `/${lang}${path}`;
}

/**
 * The page in every enabled language, then `x-default`: the page without a
 * prefix, which sends a visitor by their browser's language.
 */
export function alternates(
  path: string,
  origin: string,
  site: Languages,
): { hreflang: Language | "x-default"; href: string }[] {
  return [
    ...site.languages.map((lang) => ({ hreflang: lang, href: origin + pathIn(path, lang, site) })),
    { hreflang: "x-default" as const, href: origin + path },
  ];
}

/**
 * The enabled language the browser ranks highest in `Accept-Language`, by
 * its primary subtag (`zh-TW` and `zh-Hans` are `zh`); `q=0` excludes. The
 * default language when none matches or the header is missing.
 */
export function preferredLanguage(header: string | null, site: Languages): Language {
  if (header === null) return site.defaultLanguage;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { tag: tag.trim().toLowerCase(), weight: Number.isNaN(weight) ? 0 : weight, index };
    })
    .filter((r) => r.tag !== "" && r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of ranked) {
    if (tag === "*") return site.defaultLanguage;
    const found = site.languages.find((l) => l === tag.split("-")[0]);
    if (found !== undefined) return found;
  }
  return site.defaultLanguage;
}

/** A request that did not come from a link or a form on this site. */
export function isArrival(request: Request): boolean {
  return request.headers.get("sec-fetch-site") !== "same-origin";
}

/** What a page without a prefix varies on, for caches. */
export const VARY = "Accept-Language, Sec-Fetch-Site";
