/**
 * The site's app core (ADR 0018): standard Web APIs and the read contracts
 * only, so it runs on Bun and on Cloudflare alike. Rule that stays: the site
 * only reads. See CLAUDE.md.
 *
 * Until the site lands in M3 this is a placeholder, plus a bare front page
 * rendered from whatever `ReadQueries` the adapter passes in.
 */
import type { Language, RankRow, ReadQueries } from "@bd/contracts";
import { type Band, escapeHtml, renderPage } from "./layout.ts";

const PLACEHOLDER = renderPage({
  lang: "en",
  title: "Breaker Delta",
  heading: "Breaker Delta",
  bands: [
    {
      id: "scaffold",
      name: "Scaffold",
      content: "<p>2.0 scaffold. The site arrives in milestone M3.</p>",
    },
  ],
});

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

const FIXTURE_NOTE = "<p><small>Fixture data.</small></p>";

/** The model headline in `lang` when there is one, else the source's own headline. */
function headline(row: Pick<RankRow, "headlines" | "sourceHeadline">, lang: Language) {
  return row.headlines.find((h) => h.lang === lang) ?? row.sourceHeadline;
}

/** A bare front page: enough to prove a page renders from the read contracts alone. */
export async function renderFront(q: ReadQueries, requested: string | null): Promise<string> {
  const meta = await q.siteMeta();
  const lang = meta.languages.find((l) => l === requested) ?? meta.defaultLanguage;
  const edition = await q.edition();
  const bands: Band[] = [];
  if (edition === null) {
    bands.push({
      id: "front",
      name: "The sea is flat.",
      content:
        `<p>Nothing has been scanned yet. Next scan: ${escapeHtml(meta.nextRunAt)}.</p>\n` +
        FIXTURE_NOTE,
    });
  } else {
    const ranking: string[] = [];
    ranking.push(
      `<p>The ${escapeHtml(edition.label)} edition. Sea state: ${edition.seaState}. ` +
        `${edition.waveCount} waves up, ${edition.formedToday} new today.</p>`,
    );
    ranking.push("<ol>");
    for (const row of edition.ranking) {
      const h = headline(row, lang);
      ranking.push(
        `<li><a href="/topic/${row.slug}" lang="${escapeHtml(h.lang)}">${escapeHtml(h.text)}</a> ` +
          `<data value="${row.height}">${Math.round(row.height)}</data></li>`,
      );
    }
    ranking.push("</ol>");
    bands.push({ id: "front", name: "Front page", content: ranking.join("\n") });
    const classifieds: string[] = ["<ul>"];
    for (const echo of edition.classifieds.items) {
      classifieds.push(
        `<li>${escapeHtml(echo.groupName)}: ` +
          `<a href="${escapeHtml(echo.url)}" lang="${escapeHtml(echo.title.lang)}">` +
          `${escapeHtml(echo.title.text)}</a></li>`,
      );
    }
    classifieds.push("</ul>", FIXTURE_NOTE);
    bands.push({ id: "classifieds", name: "Classifieds", content: classifieds.join("\n") });
  }
  return renderPage({ lang, title: meta.siteName, heading: meta.siteName, bands });
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
