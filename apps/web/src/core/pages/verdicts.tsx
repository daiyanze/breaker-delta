/** @jsxImportSource preact */
/**
 * The front page's "Were we right?" band (#123, boards 01 and 02): a small
 * ticket stub for every test coming due and every verdict confirmed lately,
 * as the edition lists them, and a link to the track record. The test is
 * shown word for word, in the language it was written in.
 *
 * The band is never blank. With no stub to show, it gives the first due
 * date before any verdict (the track record's `firstDueAt`); with no test
 * registered at all, it says none is locked yet; otherwise that none is due
 * now. The link to the track record is always there.
 *
 * Days and dates are counted from the edition's own start, never the clock,
 * in the site's time zone.
 */
import type { Edition, Language, SiteMeta, TrackRecord } from "@bd/contracts";
import { Band, TicketStubs, type TicketStubsProps } from "@bd/ui/patterns";
import type { VNode } from "preact";
import { pathIn } from "../languages.ts";
import type { Translate } from "../strings/index.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The track record page; its route comes with #130. */
export const TRACK_RECORD_PATH = "/record";

/**
 * How far a test has gone at `now`: day 1 starts when it is registered and
 * the last day ends when it is due. Before registration it is day 1; after
 * the due date, the last day.
 */
export function stubDay(registeredAt: string, dueAt: string, now: string) {
  const start = Date.parse(registeredAt);
  const days = Math.max(1, Math.round((Date.parse(dueAt) - start) / DAY_MS));
  const day = Math.min(days, Math.max(1, Math.ceil((Date.parse(now) - start) / DAY_MS)));
  return { day, days };
}

/** A date as a stamp shows it, in the page's language and the site's time zone: "Nov 26". */
export function stampDate(at: string, lang: Language, timeZone: string): string {
  return new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", timeZone }).format(
    Date.parse(at),
  );
}

type Named = Pick<
  Edition["verdicts"]["due"][number],
  "slug" | "shortTitles" | "headlines" | "sourceHeadline"
>;

/** A wave's name on a stub: its short title in `lang`, else its headline, else the source's. */
export function stubName(row: Named, lang: Language): { text: string; lang: string } {
  return (
    row.shortTitles.find((h) => h.lang === lang) ??
    row.headlines.find((h) => h.lang === lang) ??
    row.sourceHeadline
  );
}

/**
 * What the band says when it has no stub to show: the first due date before
 * any verdict, that no test is locked when none is registered, else that
 * none is due now.
 */
export function noStubsText(
  record: Pick<TrackRecord, "firstDueAt" | "registered">,
  date: (at: string) => string,
  t: Translate,
): string {
  if (record.firstDueAt !== null) return t("verdicts.firstDue", { date: date(record.firstDueAt) });
  return t(record.registered === 0 ? "verdicts.noneRegistered" : "verdicts.noneDue");
}

/**
 * The band. `trackRecord` is read only when the edition lists no recent
 * verdict: to tell "no verdicts yet", and, with no stub at all, what to
 * say instead.
 */
export async function verdictsBand(
  edition: Edition,
  meta: SiteMeta,
  lang: Language,
  t: Translate,
  trackRecord: () => Promise<TrackRecord>,
): Promise<VNode> {
  const date = (at: string) => stampDate(at, lang, meta.timeZone);
  const topic = (row: Named) => ({
    ...stubName(row, lang),
    href: pathIn(`/topic/${row.slug}`, lang, meta),
  });
  const now = edition.startsAt;
  const stubs: TicketStubsProps["stubs"] = [
    ...edition.verdicts.due.map((s) => {
      const { day, days } = stubDay(s.registeredAt, s.dueAt, now);
      // Past its due date with no confirmed verdict, a test is under review.
      const waiting = Date.parse(s.dueAt) <= Date.parse(now);
      return {
        id: s.predictionId,
        stamp: waiting
          ? { kind: "under_review" as const, label: t("stamp.under_review") }
          : { kind: "due" as const, label: t("stamp.due", { date: date(s.dueAt) }), loud: true },
        criterion: s.criterion,
        topic: topic(s),
        progress: { day, days, label: t("stub.day", { day, days }) },
      };
    }),
    ...edition.verdicts.recent.map((s) => ({
      id: s.predictionId,
      stamp: { kind: s.outcome, label: t(`stamp.${s.outcome}`) },
      criterion: s.criterion,
      topic: topic(s),
      note: t(s.revised ? "stub.revised" : "stub.confirmed", { date: date(s.confirmedAt) }),
    })),
  ];
  const record = edition.verdicts.recent.length === 0 ? await trackRecord() : null;
  const noVerdictYet = record !== null && record.score.confirmed === 0;
  return (
    <Band
      id="verdicts"
      name={t("verdicts.name")}
      note={t(noVerdictYet ? "verdicts.note.before" : "verdicts.note", {
        days: meta.reviewWindowDays,
      })}
      highlight
      link={{ href: pathIn(TRACK_RECORD_PATH, lang, meta), text: t("verdicts.link") }}
    >
      {stubs.length > 0 || record === null ? (
        <TicketStubs stubs={stubs} />
      ) : (
        <p>{noStubsText(record, date, t)}</p>
      )}
    </Band>
  );
}
