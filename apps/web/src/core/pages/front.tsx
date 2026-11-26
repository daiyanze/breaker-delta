/** @jsxImportSource preact */
/**
 * A bare front page: enough to prove a page renders from the read contracts
 * alone. Every piece of text is a plain string; the renderer escapes it.
 */
import type { Language, RankRow } from "@bd/contracts";
import { Band } from "@bd/ui/patterns";
import { Document } from "@bd/ui/runtime";
import type { VNode } from "preact";
import type { RouteContext } from "../routes.ts";
import { siteHead } from "./head.tsx";

/** The model headline in `lang` when there is one, else the source's own headline. */
function headline(row: Pick<RankRow, "headlines" | "sourceHeadline">, lang: Language) {
  return row.headlines.find((h) => h.lang === lang) ?? row.sourceHeadline;
}

const FIXTURE_NOTE = (
  <p>
    <small>Fixture data.</small>
  </p>
);

export async function frontPage(ctx: RouteContext): Promise<{ document: VNode }> {
  const meta = await ctx.queries.siteMeta();
  const edition = await ctx.queries.edition();
  const bands =
    edition === null ? (
      <Band id="front" name="The sea is flat.">
        <p>Nothing has been scanned yet. Next scan: {meta.nextRunAt}.</p>
        {FIXTURE_NOTE}
      </Band>
    ) : (
      <>
        <Band id="front" name="Front page">
          <p>
            The {edition.label} edition. Sea state: {edition.seaState}. {edition.waveCount} waves
            up, {edition.formedToday} new today.
          </p>
          <ol>
            {edition.ranking.map((row) => {
              const h = headline(row, ctx.lang);
              return (
                <li key={row.slug}>
                  <a href={`/topic/${row.slug}`} lang={h.lang}>
                    {h.text}
                  </a>{" "}
                  <data value={row.height}>{Math.round(row.height)}</data>
                </li>
              );
            })}
          </ol>
        </Band>
        <Band id="classifieds" name="Classifieds">
          <ul>
            {edition.classifieds.items.map((echo) => (
              <li key={echo.url}>
                {echo.groupName}:{" "}
                <a href={echo.url} lang={echo.title.lang}>
                  {echo.title.text}
                </a>
              </li>
            ))}
          </ul>
          {FIXTURE_NOTE}
        </Band>
      </>
    );
  return {
    document: (
      <Document lang={ctx.lang} title={meta.siteName} head={siteHead()}>
        <header class="page">
          <h1>{meta.siteName}</h1>
        </header>
        <main class="page">{bands}</main>
      </Document>
    ),
  };
}
