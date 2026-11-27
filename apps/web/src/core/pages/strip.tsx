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
 */
import type { Edition, SiteMeta } from "@bd/contracts";
import { DateStrip } from "@bd/ui/patterns";
import { ThemeSwitch } from "@bd/ui/primitives";
import type { VNode } from "preact";
import { pathIn } from "../languages.ts";
import type { RouteContext } from "../routes.ts";
import { translator } from "../strings/index.ts";

/** The parts of `at`'s local date in `timeZone`, as numbers. */
function localDay(at: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** The day's number in its year: January 1 is 1. */
export function dayOfYear(d: { year: number; month: number; day: number }): number {
  return (Date.UTC(d.year, d.month - 1, d.day) - Date.UTC(d.year, 0, 0)) / 86_400_000;
}

/** `at`'s local time in `timeZone`, as `HH:MM`. */
function clock(at: Date, lang: string, timeZone: string): string {
  return new Intl.DateTimeFormat(lang, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

export function pageStrip(
  ctx: Pick<RouteContext, "lang">,
  meta: Pick<SiteMeta, "timeZone" | "nextRunAt" | "languages" | "defaultLanguage">,
  edition: Pick<Edition, "startsAt" | "label" | "seaState" | "waveCount" | "formedToday"> | null,
  menu: VNode | null,
): VNode {
  const t = translator(ctx.lang);
  const tz = meta.timeZone;
  const at = new Date(edition?.startsAt ?? meta.nextRunAt);
  const local = localDay(at, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  const waves = edition?.waveCount ?? 0;
  const sea = t(`sea.${edition?.seaState ?? "flat"}`);
  const note =
    edition === null
      ? t("strip.first", { time: clock(at, ctx.lang, tz) })
      : t("strip.note", { formed: edition.formedToday, time: edition.label });
  const shortNote = edition === null ? note : t("strip.short", { formed: edition.formedToday });
  return (
    <DateStrip
      month={new Intl.DateTimeFormat(ctx.lang, { timeZone: tz, month: "short" }).format(at)}
      day={String(local.day)}
      date={new Intl.DateTimeFormat(ctx.lang, { timeZone: tz, dateStyle: "full" }).format(at)}
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
