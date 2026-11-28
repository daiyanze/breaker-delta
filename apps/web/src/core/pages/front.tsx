/** @jsxImportSource preact */
/**
 * A bare front page: enough to prove a page renders from the read contracts
 * alone. Every piece of text is a plain string; the renderer escapes it.
 * Interface text comes from the string tables in the page's language (#107),
 * the theme switch's two names included. The switch is its one island
 * (#105), in the masthead's row of tools with the language menu (#110).
 * The six tallest
 * waves are the headlines in three tiers (#119, boards 01 and 02), the lead
 * with the echo stack (#114). Beside them, the index (#120) lists every
 * wave, the six included, in the front band's right rail. The tide table
 * (#121) follows the front band, before the fading notices, then "Were we
 * right?" (#123, `verdicts.tsx`) and the classifieds (boards 01 and 02).
 */
import type { Edition, Language, RankRow, SiteMeta } from "@bd/contracts";
import {
  Band,
  echoStackLayers,
  FadingNotices,
  type FadingNoticesProps,
  Headline,
  type HeadlineLead,
  type HeadlineStory,
  Index,
  type IndexRowProps,
} from "@bd/ui/patterns";
import { ThemeSwitch } from "@bd/ui/primitives";
import { Document } from "@bd/ui/runtime";
import { INDEX_PHONE_ROWS } from "@bd/ui/tokens";
import type { VNode } from "preact";
import { pathIn } from "../languages.ts";
import type { RouteContext } from "../routes.ts";
import { type Translate, translator } from "../strings/index.ts";
import { siteFooter } from "./footer.tsx";
import { pageLanguages } from "./head.tsx";
import { pageMasthead } from "./masthead.tsx";
import { tideBand } from "./tide.tsx";
import { verdictsBand } from "./verdicts.tsx";

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

/** The short title in `lang` when there is one, else the headline (`headline`). */
function shortTitle(row: RankRow, lang: Language) {
  return row.shortTitles.find((h) => h.lang === lang) ?? headline(row, lang);
}

/** Ranks 2 and 3 are the second tier, 4 to 6 the third; the index lists every rank. */
const SECOND_FROM = 1;
const THIRD_FROM = 3;
const TIERS_TO = 6;

interface Tiers {
  edition: Edition;
  t: Translate;
  lang: Language;
  /** The site's IANA time zone, for calendar days. */
  timeZone: string;
  href: (row: RankRow) => string;
}

/** The calendar day of `instant` in `timeZone`, as "2026-11-19". */
function dayIn(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The day before `day` ("2026-11-19" gives "2026-11-18"). */
function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The line under a headline, and whether the wave is going out. A null
 * change means there was no wave up 24 hours ago: one that formed today,
 * one that formed yesterday, or an older one that went flat and came back
 * (the pipeline's `baseHeight`), told apart by `formedAt`'s day in the
 * site's time zone. A change is worded as it is shown, rounded: a wave
 * that rounds to 0% is level, not down, and is not set as going out.
 */
function change(row: RankRow, formed: "today" | "yesterday" | "earlier", t: Translate) {
  if (row.change24h === null) {
    const key = {
      today: "headline.new",
      yesterday: "headline.newYesterday",
      earlier: "headline.again",
    } as const;
    return { delta: t(key[formed]), fading: false };
  }
  const percent = Math.round(row.change24h);
  if (percent < 0) return { delta: t("headline.down", { percent: -percent }), fading: true };
  if (percent > 0) return { delta: t("headline.up", { percent }), fading: false };
  return { delta: t("headline.level"), fading: false };
}

/**
 * One ranked wave as a headline. Formed today: `formedAt` falls on the
 * edition's day in the site's time zone. Going out: down over 24 hours
 * (`design/system/components/Headline`).
 */
function story(row: RankRow, { edition, t, lang, timeZone, href }: Tiers): HeadlineStory {
  const today = dayIn(edition.startsAt, timeZone);
  const day = dayIn(row.formedAt, timeZone);
  const formed = day === today ? "today" : day === dayBefore(today) ? "yesterday" : "earlier";
  const { delta, fading } = change(row, formed, t);
  return {
    href: href(row),
    title: headline(row, lang),
    height: row.height,
    formedToday: formed === "today",
    fading,
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
      third={ranking.slice(THIRD_FROM, TIERS_TO).map((r) => story(r, tiers))}
      note={tiers.t("headline.key")}
    />
  );
}

/**
 * One wave as an index row. The change is the 24-hour change rounded, as
 * the headlines word it: "new" for a wave formed today (it was not up 24
 * hours ago), nothing for a level wave, and nothing for a null change on a
 * wave that formed earlier (yesterday, or back after going flat), which the
 * row has no room to tell apart.
 */
function indexRow(row: RankRow, tiers: Tiers): IndexRowProps {
  const { t, lang, edition, timeZone } = tiers;
  const formedToday = dayIn(row.formedAt, timeZone) === dayIn(edition.startsAt, timeZone);
  const percent = row.change24h === null ? null : Math.round(row.change24h);
  const change =
    percent === null
      ? formedToday
        ? t("index.new")
        : ""
      : percent > 0
        ? t("index.up", { percent })
        : percent < 0
          ? t("index.down", { percent: -percent })
          : "";
  return {
    href: tiers.href(row),
    rank: row.rank,
    title: shortTitle(row, lang),
    height: row.height,
    formedToday,
    change,
  };
}

function index(tiers: Tiers): VNode {
  const { t, edition } = tiers;
  return (
    <Index
      id="index"
      name={t("index.name")}
      order={t("index.order")}
      rows={edition.ranking.map((r) => indexRow(r, tiers))}
      note={t("index.key")}
      showAll={t("index.showAll", { count: edition.ranking.length })}
      showFewer={t("index.showFewer", { count: INDEX_PHONE_ROWS })}
    />
  );
}

export async function frontPage(ctx: RouteContext): Promise<{ document: VNode }> {
  const meta = await ctx.queries.siteMeta();
  const edition = await ctx.queries.edition();
  const t = translator(ctx.lang);
  const languages = pageLanguages(ctx, meta);
  const verdicts =
    edition === null
      ? null
      : await verdictsBand(edition, meta, ctx.lang, t, () => ctx.queries.trackRecord());
  const href = (row: RankRow) => pathIn(`/topic/${row.slug}`, ctx.lang, meta);
  const tiers = (e: Edition): Tiers => ({
    edition: e,
    t,
    lang: ctx.lang,
    timeZone: meta.timeZone,
    href,
  });
  const bands =
    edition === null ? (
      <Band id="front" name={t("front.flat.name")}>
        <p>{t("front.flat.text", { next: meta.nextRunAt })}</p>
        {fixtureNote(t)}
      </Band>
    ) : (
      <>
        <Band
          id="front"
          name={t("front.name")}
          aside={edition.ranking.length === 0 ? undefined : index(tiers(edition))}
        >
          <p>
            {t("front.edition", {
              label: edition.label,
              sea: t(`sea.${edition.seaState}`),
              waves: edition.waveCount,
              formed: edition.formedToday,
            })}
          </p>
          {headlines(tiers(edition))}
        </Band>
        {tideBand(edition, meta, ctx.lang, t, (row) => headline(row, ctx.lang))}
        <FadingNotices {...fadingNotices(edition.ebb, meta, ctx.lang, t)} />
        {verdicts}
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
        {pageMasthead({
          lang: ctx.lang,
          site: meta,
          current: "front",
          name: meta.siteName,
          heading: true,
          tools: (
            <>
              {languages.menu}
              <ThemeSwitch toDark={t("theme.toDark")} toLight={t("theme.toLight")} />
            </>
          ),
        })}
        <main class="page">{bands}</main>
        {siteFooter(ctx, meta)}
      </Document>
    ),
  };
}
