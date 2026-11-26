/**
 * The site's routes (ADR 0020, section 1): a table of `URLPattern`s. A route
 * reads through the read contracts and returns a document or a `Response`;
 * `respond` turns a document into HTML with `renderDocument`, the one place
 * HTML text is made.
 */
import type { Language, ReadQueries } from "@bd/contracts";
import { renderDocument } from "@bd/ui/runtime";
import type { VNode } from "preact";
import { frontPage } from "./pages/front.tsx";

export interface RouteContext {
  request: Request;
  url: URL;
  params: Readonly<Record<string, string | undefined>>;
  lang: Language;
  queries: ReadQueries;
}

/** A document with its status and headers (a 404 page, cache tags), or any other Response. */
export type RouteResult =
  | Response
  | { document: VNode; status?: number; headers?: Readonly<Record<string, string>> };

export interface Route {
  pattern: URLPattern;
  handle(ctx: RouteContext): Promise<RouteResult>;
}

export const ROUTES: readonly Route[] = [
  { pattern: new URLPattern({ pathname: "/" }), handle: frontPage },
];

/** The first route whose pattern matches the request, with its path parameters. */
export function match(
  routes: readonly Route[],
  url: URL,
): { route: Route; params: Readonly<Record<string, string | undefined>> } | null {
  for (const route of routes) {
    const found = route.pattern.exec(url);
    if (found !== null) return { route, params: found.pathname.groups };
  }
  return null;
}

export function respond(result: RouteResult): Response {
  if (result instanceof Response) return result;
  return new Response(renderDocument(result.document), {
    status: result.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8", ...result.headers },
  });
}
