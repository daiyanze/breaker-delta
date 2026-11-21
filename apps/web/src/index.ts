/**
 * bd-web placeholder. It exists so CI, preview deploys and the two-Worker
 * layout are exercised from day one. M3 replaces it with the vinext site.
 * Rule that stays: this Worker only reads. See CLAUDE.md.
 *
 * With `READ_SOURCE=fixtures` the front page is rendered from the fixture
 * query layer (`@bd/fixtures`, issue #162), with no database. `?set=` picks a
 * fixture set and `?lang=` a language.
 */
import type { Language, RankRow, ReadQueries } from "@bd/contracts";
import { createFixtureReadQueries, DEFAULT_FIXTURE_SET, isFixtureSetName } from "@bd/fixtures";

export interface Env {
  /** "fixtures" reads from `@bd/fixtures`. The database query layer arrives with #57. */
  READ_SOURCE?: string;
  /** Fixture set used when `?set=` is not given. */
  FIXTURE_SET?: string;
}

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true });
    if (url.pathname !== "/") return new Response("not found", { status: 404 });
    if (env.READ_SOURCE !== "fixtures") return html(PLACEHOLDER);
    const name = url.searchParams.get("set") ?? env.FIXTURE_SET ?? DEFAULT_FIXTURE_SET;
    if (!isFixtureSetName(name)) return new Response("unknown fixture set", { status: 404 });
    return html(await renderFront(createFixtureReadQueries(name), url.searchParams.get("lang")));
  },
} satisfies ExportedHandler<Env>;
