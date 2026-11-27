/** @jsxImportSource preact */
/**
 * A bare front page: enough to prove a page renders from the read contracts
 * alone. Every piece of text is a plain string; the renderer escapes it.
 * Interface text comes from the string tables in the page's language (#107),
 * the theme switch's two names included. The switch is its one island
 * (#105); it moves into the masthead's top bar with #110. The six tallest
 * waves are the headlines in three tiers (#119, boards 01 and 02), the lead
 * with the echo stack (#114); the rest stay a plain list until the index
 * (#120) takes them.
 */
import type { Edition, Language, RankRow } from "@bd/contracts";
import {
  Band,
  echoStackLayers,
  Headline,
  type HeadlineLead,
  type HeadlineStory,
} from "@bd/ui/patterns";
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

/** Ranks 2 and 3 are the second tier, 4 to 6 the third; from 7 on, the index (#120). */
const SECOND_FROM = 1;
const THIRD_FROM = 3;
const INDEX_FROM = 6;

interface Tiers {
  edition: Edition;
  t: Translate;
  lang: Language;
  href: (row: RankRow) => string;
}

/**
 * One ranked wave as a headline. Formed today: its slug is in the edition's
 * tide table. Going out: down over 24 hours
 * (`design/system/components/Headline`).
 */
function story(row: RankRow, { edition, t, lang, href }: Tiers): HeadlineStory {
  const formedToday = edition.tideTable.some((w) => w.slug === row.slug);
  const change = row.change24h;
  const delta =
    change === null
      ? t(formedToday ? "headline.new" : "headline.newYesterday")
      : change < 0
        ? t("headline.down", { percent: Math.round(-change) })
        : t("headline.up", { percent: Math.round(change) });
  return {
    href: href(row),
    title: headline(row, lang),
    height: row.height,
    formedToday,
    fading: change !== null && change < 0,
    delta,
    meta: t("headline.meta", { sources: row.sourceCount, echoes: row.echoCount }),
  };
}

function lead(row: RankRow, tiers: Tiers): HeadlineLead {
  const { t, edition } = tiers;
  const s = story(row, tiers);
  return {
    ...s,
    kicker: t(s.formedToday ? "headline.kicker.formed" : "headline.kicker.tallest"),
    stackLabel: t("echoStack.label", { layers: echoStackLayers(row.height) }),
    trend: row.trend,
    trendLabel: t("headline.trend", { time: edition.label }),
  };
}

function headlines(tiers: Tiers): VNode | null {
  const { ranking } = tiers.edition;
  const top = ranking[0];
  if (top === undefined) return null;
  return (
    <Headline
      lead={lead(top, tiers)}
      second={ranking.slice(SECOND_FROM, THIRD_FROM).map((r) => story(r, tiers))}
      third={ranking.slice(THIRD_FROM, INDEX_FROM).map((r) => story(r, tiers))}
      note={tiers.t("headline.key")}
    />
  );
}

export async function frontPage(ctx: RouteContext): Promise<{ document: VNode }> {
  const meta = await ctx.queries.siteMeta();
  const edition = await ctx.queries.edition();
  const t = translator(ctx.lang);
  const languages = pageLanguages(ctx, meta);
  const href = (row: RankRow) => pathIn(`/topic/${row.slug}`, ctx.lang, meta);
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
          {headlines({ edition, t, lang: ctx.lang, href })}
          {edition.ranking.length > INDEX_FROM ? (
            <ol start={INDEX_FROM + 1}>
              {edition.ranking.slice(INDEX_FROM).map((row) => {
                const h = headline(row, ctx.lang);
                return (
                  <li key={row.slug}>
                    <a href={href(row)} lang={h.lang}>
                      {h.text}
                    </a>{" "}
                    <data value={row.height}>{Math.round(row.height)}</data>
                  </li>
                );
              })}
            </ol>
          ) : null}
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
