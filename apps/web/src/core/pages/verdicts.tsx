/** @jsxImportSource preact */
/**
 * The front page's "Were we right?" band (#115, board 01): a small ticket
 * stub for every test coming due and every verdict confirmed lately, as the
 * edition lists them. The test is shown word for word, in the language it
 * was written in. Days and dates are counted from the edition's own start,
 * never the clock, in the site's time zone.
 */
import type { Edition, Language, SiteMeta } from "@bd/contracts";
import { Band, TicketStubs, type TicketStubsProps } from "@bd/ui/patterns";
import type { VNode } from "preact";
import { pathIn } from "../languages.ts";
import type { Translate } from "../strings/index.ts";
import { headline } from "./topic-name.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

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

export function verdictsBand(
  edition: Edition,
  meta: SiteMeta,
  lang: Language,
  t: Translate,
): VNode {
  const date = (at: string) => stampDate(at, lang, meta.timeZone);
  const topic = (row: Parameters<typeof headline>[0] & { slug: string }) => {
    const name = headline(row, lang);
    return { text: name.text, lang: name.lang, href: pathIn(`/topic/${row.slug}`, lang, meta) };
  };
  const stubs: TicketStubsProps["stubs"] = [
    ...edition.verdicts.due.map((s) => {
      const { day, days } = stubDay(s.registeredAt, s.dueAt, edition.startsAt);
      return {
        id: s.predictionId,
        stamp: { kind: "due" as const, label: t("stamp.due", { date: date(s.dueAt) }), loud: true },
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
      note: t("stub.confirmed", { date: date(s.confirmedAt) }),
    })),
  ];
  return (
    <Band id="verdicts" name={t("verdicts.name")} note={t("verdicts.note")}>
      {stubs.length === 0 ? <p>{t("verdicts.none")}</p> : <TicketStubs stubs={stubs} />}
    </Band>
  );
}
