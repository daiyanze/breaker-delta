/** @jsxImportSource preact */
/**
 * A bare front page: enough to prove a page renders from the read contracts
 * alone. Every piece of text is a plain string; the renderer escapes it.
 * Interface text comes from the string tables in the page's language (#107),
 * the theme switch's two names included. The switch is its one island
 * (#105); it moves into the masthead's top bar with #110.
 */
import type { Edition, Language, RankRow, SiteMeta } from "@bd/contracts";
import { Band, FadingNotices, type FadingNoticesProps } from "@bd/ui/patterns";
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

/**
 * The fading notices (#122) from the edition's `ebb`: each notice's
 * sentence is the fixed pattern of the string tables, its numbers the
 * data's. Heights are shown whole, as on the ranking; the day a wave formed
 * is the site's calendar day.
 */
function fadingNotices(
  ebb: Edition["ebb"],
  meta: SiteMeta,
  lang: Language,
  t: Translate,
): FadingNoticesProps {
  const day = new Intl.DateTimeFormat(lang, {
    month: "short",
    day: "numeric",
    timeZone: meta.timeZone,
  });
  return {
    name: t("ebb.name"),
    note: t("ebb.note"),
    sunset: t("ebb.sunset"),
    none: t("ebb.none"),
    ...(ebb.wentFlat24h === 0
      ? {}
      : {
          wentFlat: {
            href: pathIn("/changes?type=went_flat", lang, meta),
            text: t("ebb.wentFlat", { count: ebb.wentFlat24h }),
          },
        }),
    notices: ebb.notices.map((n) => {
      const h = headline(n, lang);
      const height = Math.round(n.height);
      const drop = n.change24h === null ? 0 : Math.round(-n.change24h);
      const obit = {
        day: day.format(new Date(n.formedAt)),
        peak: Math.round(n.peak.height),
        echoes: n.echoCount,
      };
      return {
        title: { text: h.text, lang: h.lang },
        href: pathIn(`/topic/${n.slug}`, lang, meta),
        text: n.echoCount === 1 ? t("ebb.obit.one", obit) : t("ebb.obit", obit),
        now: drop > 0 ? t("ebb.now", { height, drop }) : t("ebb.now.only", { height }),
        ripple: { height: n.height, label: t("ebb.ripple", { height }) },
      };
    }),
  };
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
            {edition.ranking.map((row) => {
              const h = headline(row, ctx.lang);
              return (
                <li key={row.slug}>
                  <a href={pathIn(`/topic/${row.slug}`, ctx.lang, meta)} lang={h.lang}>
                    {h.text}
                  </a>{" "}
                  <data value={row.height}>{Math.round(row.height)}</data>
                </li>
              );
            })}
          </ol>
        </Band>
        <FadingNotices {...fadingNotices(edition.ebb, meta, ctx.lang, t)} />
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
