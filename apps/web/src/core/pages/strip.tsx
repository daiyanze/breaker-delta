/** @jsxImportSource preact */
/**
 * The date strip every public page puts above its masthead (#109): the
 * `DateStrip` of `@bd/ui`, filled in from the read contracts in the page's
 * language, with the page's language menu and the theme switch inside it.
 *
 * Its day is the shown run's (`edition.startsAt`) in the site's time zone,
 * or, before the first scan, the next run's; the issue number is that day's
 * number in its year (board 01: November 19 is No. 323). The wave count,
 * "new today" and the sea state are the edition's own fields: the query
 * layer chooses the sea state by the design's rule, and the contract checks
 * in `@bd/fixtures` hold every query layer to it. With no edition the sea is
 * flat and the tag gives the first scan's time (board 17).
 *
 * `Intl` gives only the local date and time as numbers. The names of months
 * and weekdays and the date's form come from the string tables: how a
 * runtime's ICU data writes a full date differs between Bun builds and
 * runtimes (a space before 星期四 on one, none on another), and the
 * Chinese and Japanese forms are board 35's.
 */
import type { Edition, SiteMeta } from "@bd/contracts";
import { DateStrip } from "@bd/ui/patterns";
import { ThemeSwitch } from "@bd/ui/primitives";
import type { VNode } from "preact";
import { pathIn } from "../languages.ts";
import type { RouteContext } from "../routes.ts";
import { translator } from "../strings/index.ts";

type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface LocalTime {
  year: number;
  month: Month;
  day: number;
  hour: number;
  minute: number;
}

/** `at`'s local date and time in `timeZone`, as numbers. */
export function localTime(at: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: part("year"),
    month: part("month") as Month,
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
}

/** The day's number in its year: January 1 is 1. */
export function dayOfYear(d: Pick<LocalTime, "year" | "month" | "day">): number {
  return (Date.UTC(d.year, d.month - 1, d.day) - Date.UTC(d.year, 0, 0)) / 86_400_000;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function pageStrip(
  ctx: Pick<RouteContext, "lang">,
  meta: Pick<SiteMeta, "timeZone" | "nextRunAt" | "languages" | "defaultLanguage">,
  edition: Pick<Edition, "startsAt" | "label" | "seaState" | "waveCount" | "formedToday"> | null,
  menu: VNode | null,
): VNode {
  const t = translator(ctx.lang);
  const local = localTime(new Date(edition?.startsAt ?? meta.nextRunAt), meta.timeZone);
  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay() as Weekday;
  const waves = edition?.waveCount ?? 0;
  const sea = t(`sea.${edition?.seaState ?? "flat"}`);
  const note =
    edition === null
      ? t("strip.first", { time: `${pad(local.hour)}:${pad(local.minute)}` })
      : t("strip.note", { formed: edition.formedToday, time: edition.label });
  const shortNote = edition === null ? note : t("strip.short", { formed: edition.formedToday });
  return (
    <DateStrip
      month={t(`month.short.${local.month}`)}
      day={String(local.day)}
      date={t("strip.date", {
        weekday: t(`weekday.${weekday}`),
        month: t(`month.${local.month}`),
        day: local.day,
        year: local.year,
      })}
      dateTime={`${local.year}-${pad(local.month)}-${pad(local.day)}`}
      line={t("strip.line", { number: dayOfYear(local), sea })}
      count={t(waves === 1 ? "strip.count.one" : "strip.count.other", { count: waves })}
      note={note}
      shortNote={shortNote}
      search={{ href: pathIn("/search", ctx.lang, meta), label: t("search.name") }}
    >
      {menu}
      <ThemeSwitch toDark={t("theme.toDark")} toLight={t("theme.toLight")} />
    </DateStrip>
  );
}
