/**
 * The site's app core (ADR 0018): standard Web APIs and the read contracts
 * only, so it runs on Bun and on Cloudflare alike. Rule that stays: the site
 * only reads. See CLAUDE.md.
 *
 * Until the site lands in M3 this is a placeholder, plus a bare front page
 * rendered from whatever `ReadQueries` the adapter passes in. Pages are
 * Preact components in `pages/`; the route table is `routes.ts`. Each
 * enabled language has its own pages (#107): `languages.ts` reads the
 * language from the path and sends a visitor by their browser's language.
 */
import type { ReadQueries } from "@bd/contracts";
import { isArrival, isSitePath, locate, pathIn, preferredLanguage, VARY } from "./languages.ts";
import { placeholderPage } from "./pages/placeholder.tsx";
import { match, ROUTES, respond } from "./routes.ts";

export { frontPage } from "./pages/front.tsx";
export { placeholderPage } from "./pages/placeholder.tsx";
export type { Route, RouteContext, RouteResult } from "./routes.ts";

/**
 * Pick the query layer per request. Null means "no query layer configured":
 * the placeholder page is served.
 */
export type QueryLayer = (request: Request) => ReadQueries | null;

export interface Site {
  fetch(request: Request): Promise<Response>;
}

const notFound = () => new Response("not found", { status: 404 });

/**
 * A redirect to a path on this site; `vary` when where it goes depends on
 * the request's headers. Anything that is not a same-origin path (`//host`,
 * `/\host`) is a 404, never a `Location`.
 */
function redirect(location: string, vary: boolean): Response {
  if (!isSitePath(location)) return notFound();
  const headers: Record<string, string> = { location };
  if (vary) headers.vary = VARY;
  return new Response(null, { status: 302, headers });
}

export function createSite(queries: QueryLayer): Site {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") return Response.json({ ok: true });
      const q = queries(request);
      if (q === null) return match(ROUTES, url) === null ? notFound() : respond(placeholderPage());
      const meta = await q.siteMeta();
      const at = locate(url.pathname, meta);
      if (at.kind === "redirect") return redirect(at.location + url.search, false);
      // The path is set, not parsed against the request: `//host` stays a path.
      const target = new URL(url);
      target.pathname = at.path;
      const found = match(ROUTES, target);
      if (found === null) return notFound();
      // Only a page without a prefix depends on the browser's language.
      const varies = !at.prefixed && meta.languages.length > 1;
      if (varies && isArrival(request)) {
        const wanted = preferredLanguage(request.headers.get("accept-language"), meta);
        if (wanted !== at.lang) return redirect(pathIn(at.path, wanted, meta) + url.search, true);
      }
      const ctx = { request, url, params: found.params, lang: at.lang, queries: q };
      const res = respond(await found.route.handle(ctx));
      if (!varies) return res;
      const headers = new Headers(res.headers);
      headers.set("vary", VARY);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    },
  };
}
