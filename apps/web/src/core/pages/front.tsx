/** @jsxImportSource preact */
/**
 * A bare front page: enough to prove a page renders from the read contracts
 * alone. Every piece of text is a plain string; the renderer escapes it.
 * Interface text comes from the string tables in the page's language (#107),
 * the theme switch's two names included. The switch is its one island
 * (#105); it moves into the masthead's top bar with #110. The tallest wave
 * has the echo stack beside its height (#114, board 01); the lead's own
 * layout comes with the headlines (#119).
 */
import type { Language, RankRow } from "@bd/contracts";
import { Band, EchoStack, echoStackLayers } from "@bd/ui/patterns";
import { ThemeSwitch } from "@bd/ui/primitives";
import { Document } from "@bd/ui/runtime";
import type { VNode } from "preact";
import { pathIn } from "../languages.ts";
import type { RouteContext } from "../routes.ts";
import { type Translate, translator } from "../strings/index.ts";
import { pageLanguages } from "./head.tsx";

/** The model headline in `lang` when there is one, else the source's own headline. */
function headline(row: Pick<RankRow, "headlines" | "sourceHeadline">, lang: Language) {
  return row.headlines.find((h) => h.lang === lang) ?? row.sourceHeadline;
}

const fixtureNote = (t: Translate) => (
  <p>
    <small>{t("fixture.note")}</small>
  </p>
);

export async function frontPage(ctx: RouteContext): Promise<{ document: VNode }> {
  const meta = await ctx.queries.siteMeta();
  const edition = await ctx.queries.edition();
  const t = translator(ctx.lang);
  const languages = pageLanguages(ctx, meta);
  const bands =
    edition === null ? (
      <Band id="front" name={t("front.flat.name")}>
        <p>{t("front.flat.text", { next: meta.nextRunAt })}</p>
        {fixtureNote(t)}
      </Band>
    ) : (
      <>
        <Band id="front" name={t("front.name")}>
          <p>
            {t("front.edition", {
              label: edition.label,
              sea: t(`sea.${edition.seaState}`),
              waves: edition.waveCount,
              formed: edition.formedToday,
            })}
          </p>
          <ol>
            {edition.ranking.map((row, i) => {
              const h = headline(row, ctx.lang);
              return (
                <li key={row.slug}>
                  {i === 0 ? (
                    <EchoStack
                      height={row.height}
                      label={t("echoStack.label", { layers: echoStackLayers(row.height) })}
                    />
                  ) : null}
                  <a href={pathIn(`/topic/${row.slug}`, ctx.lang, meta)} lang={h.lang}>
                    {h.text}
                  </a>{" "}
                  <data value={row.height}>{Math.round(row.height)}</data>
                </li>
              );
            })}
          </ol>
        </Band>
        <Band id="classifieds" name={t("classifieds.name")}>
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
          {fixtureNote(t)}
        </Band>
      </>
    );
  return {
    document: (
      <Document lang={ctx.lang} title={meta.siteName} head={languages.head}>
        <header class="page">
          {languages.menu}
          <h1>{meta.siteName}</h1>
          <ThemeSwitch toDark={t("theme.toDark")} toLight={t("theme.toLight")} />
        </header>
        <main class="page">{bands}</main>
      </Document>
    ),
  };
}
