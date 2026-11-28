/** @jsxImportSource preact */
/**
 * The front page's tide table band (#121): the edition's waves formed
 * today, placed at the hour each formed in the site's time zone. Board 19
 * leaves the band out with fewer than two (`TIDE_MIN_WAVES`).
 */
import type { Edition, Language, RankRow, SiteMeta } from "@bd/contracts";
import { Band, TideTable, type TideWave } from "@bd/ui/patterns";
import type { VNode } from "preact";
import { pathIn } from "../languages.ts";
import type { Translate } from "../strings/index.ts";

/** Board 19: "the tide table needs more than one new wave". */
export const TIDE_MIN_WAVES = 2;

/** An instant's local clock time in `timeZone`: `HH:MM` and the hour of the day as a number. */
export function localClock(instant: string, timeZone: string): { at: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: "hour" | "minute") => parts.find((p) => p.type === type)?.value ?? "00";
  const at = `${part("hour")}:${part("minute")}`;
  return { at, hour: Number(part("hour")) + Number(part("minute")) / 60 };
}

/** `HH:MM` as the hour of the day. */
const hourOf = (label: string) => {
  const [hh = "0", mm = "0"] = label.split(":");
  return Number(hh) + Number(mm) / 60;
};

/** The band, or null when fewer than two waves formed today. */
export function tideBand(
  edition: Edition,
  meta: SiteMeta,
  lang: Language,
  t: Translate,
  headline: (row: RankRow) => { lang: string; text: string },
): VNode | null {
  const rows = new Map(edition.ranking.map((row) => [row.slug, row]));
  const waves: TideWave[] = [];
  for (const entry of edition.tideTable) {
    const row = rows.get(entry.slug);
    if (row === undefined) continue;
    const h = headline(row);
    waves.push({
      ...localClock(entry.formedAt, meta.timeZone),
      href: pathIn(`/topic/${entry.slug}`, lang, meta),
      title: h.text,
      lang: h.lang,
      height: entry.height,
    });
  }
  if (waves.length < TIDE_MIN_WAVES) return null;
  const times = waves.map((w) => w.at).sort();
  return (
    <Band id="tide" name={t("tide.name")} note={t("tide.note")}>
      <TideTable
        waves={waves}
        now={hourOf(edition.label)}
        summary={t("tide.summary", {
          count: waves.length,
          first: times[0] ?? "",
          last: times.at(-1) ?? "",
        })}
        nowLabel={t("tide.now")}
        laterLabel={t("tide.later")}
        highWaterLabel={(time) => t("tide.high", { time })}
      />
    </Band>
  );
}
