/**
 * The site's app core (ADR 0018): standard Web APIs and the read contracts
 * only, so it runs on Bun and on Cloudflare alike. Rule that stays: the site
 * only reads. See CLAUDE.md.
 *
 * Until the site lands in M3 this is a placeholder, plus a bare front page
 * rendered from whatever `ReadQueries` the adapter passes in. Pages are
 * Preact components in `pages/`; the route table is `routes.ts`.
 */
import type { Language, ReadQueries } from "@bd/contracts";
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

/** The language `?lang=` asks for when the site has it, else the site's default. */
export async function pickLanguage(q: ReadQueries, requested: string | null): Promise<Language> {
  const meta = await q.siteMeta();
  return meta.languages.find((l) => l === requested) ?? meta.defaultLanguage;
}

export function createSite(queries: QueryLayer): Site {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") return Response.json({ ok: true });
      const found = match(ROUTES, url);
      if (found === null) return new Response("not found", { status: 404 });
      const q = queries(request);
      if (q === null) return respond(placeholderPage());
      const lang = await pickLanguage(q, url.searchParams.get("lang"));
      return respond(
        await found.route.handle({ request, url, params: found.params, lang, queries: q }),
      );
    },
  };
}
