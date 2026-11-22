/// <reference path="./assets.d.ts" />
/**
 * The self-hosted font files, embedded in the local executable (`with {
 * type: "file" }` makes `bun build --compile` bundle them). On Cloudflare the
 * same folder is served as static assets (`assets` in wrangler.jsonc).
 */
import frauncesItalicLatin from "../../public/fonts/fraunces-italic-latin.woff2" with {
  type: "file",
};
import frauncesItalicLatinExt from "../../public/fonts/fraunces-italic-latin-ext.woff2" with {
  type: "file",
};
import frauncesLatin from "../../public/fonts/fraunces-latin.woff2" with { type: "file" };
import frauncesLatinExt from "../../public/fonts/fraunces-latin-ext.woff2" with { type: "file" };
import instrumentSansLatin from "../../public/fonts/instrument-sans-latin.woff2" with {
  type: "file",
};
import instrumentSansLatinExt from "../../public/fonts/instrument-sans-latin-ext.woff2" with {
  type: "file",
};

/** File name under `/fonts/` to its embedded path. */
export const FONT_PATHS: Readonly<Record<string, string>> = {
  "fraunces-latin.woff2": frauncesLatin,
  "fraunces-latin-ext.woff2": frauncesLatinExt,
  "fraunces-italic-latin.woff2": frauncesItalicLatin,
  "fraunces-italic-latin-ext.woff2": frauncesItalicLatinExt,
  "instrument-sans-latin.woff2": instrumentSansLatin,
  "instrument-sans-latin-ext.woff2": instrumentSansLatinExt,
};

/** Serves `/fonts/<file>`, or null for any other path. */
export function serveFont(request: Request): Response | null {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/fonts/")) return null;
  const path = Object.hasOwn(FONT_PATHS, pathname.slice(7))
    ? FONT_PATHS[pathname.slice(7)]
    : undefined;
  if (path === undefined) return new Response("not found", { status: 404 });
  return new Response(Bun.file(path), {
    headers: { "content-type": "font/woff2", "cache-control": "public, max-age=86400" },
  });
}
