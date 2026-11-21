/**
 * The site's app core (ADR 0018): standard Web APIs and the read contracts
 * only, so it runs on Bun and on Cloudflare alike. Rule that stays: the site
 * only reads. See CLAUDE.md.
 *
 * Until the site lands in M3 this is a placeholder, plus a bare front page
 * rendered from whatever `ReadQueries` the adapter passes in.
 */
import type { Language, RankRow, ReadQueries } from "@bd/contracts";

const PLACEHOLDER = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Breaker Delta</title>
</head>
<body>
<h1>Breaker Delta</h1>
<p>2.0 scaffold. The site arrives in milestone M3.</p>
</body>
</html>`;

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The model headline in `lang` when there is one, else the source's own headline. */
function headline(row: Pick<RankRow, "headlines" | "sourceHeadline">, lang: Language) {
  return row.headlines.find((h) => h.lang === lang) ?? row.sourceHeadline;
}

/** A bare front page: enough to prove a page renders from the read contracts alone. */
export async function renderFront(q: ReadQueries, requested: string | null): Promise<string> {
  const meta = await q.siteMeta();
  const lang = meta.languages.find((l) => l === requested) ?? meta.defaultLanguage;
  const edition = await q.edition();
  const parts: string[] = [];
  if (edition === null) {
    parts.push("<h2>The sea is flat.</h2>");
    parts.push(`<p>Nothing has been scanned yet. Next scan: ${escapeHtml(meta.nextRunAt)}.</p>`);
  } else {
    parts.push(
      `<p>The ${escapeHtml(edition.label)} edition. Sea state: ${edition.seaState}. ` +
        `${edition.waveCount} waves up, ${edition.formedToday} new today.</p>`,
    );
    parts.push("<ol>");
    for (const row of edition.ranking) {
      const h = headline(row, lang);
      parts.push(
        `<li><a href="/topic/${row.slug}" lang="${escapeHtml(h.lang)}">${escapeHtml(h.text)}</a> ` +
          `<data value="${row.height}">${Math.round(row.height)}</data></li>`,
      );
    }
    parts.push("</ol>");
    parts.push("<h2>Classifieds</h2><ul>");
    for (const echo of edition.classifieds.items) {
      parts.push(
        `<li>${escapeHtml(echo.groupName)}: ` +
          `<a href="${escapeHtml(echo.url)}" lang="${escapeHtml(echo.title.lang)}">` +
          `${escapeHtml(echo.title.text)}</a></li>`,
      );
    }
    parts.push("</ul>");
  }
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(meta.siteName)}</title>
</head>
<body>
<h1>${escapeHtml(meta.siteName)}</h1>
${parts.join("\n")}
<p><small>Fixture data.</small></p>
</body>
</html>`;
}

/**
 * Pick the query layer per request. Null means "no query layer configured":
 * the placeholder page is served.
 */
export type QueryLayer = (request: Request) => ReadQueries | null;

export interface Site {
  fetch(request: Request): Promise<Response>;
}

export function createSite(queries: QueryLayer): Site {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") return Response.json({ ok: true });
      if (url.pathname !== "/") return new Response("not found", { status: 404 });
      const q = queries(request);
      if (q === null) return html(PLACEHOLDER);
      return html(await renderFront(q, url.searchParams.get("lang")));
    },
  };
}
