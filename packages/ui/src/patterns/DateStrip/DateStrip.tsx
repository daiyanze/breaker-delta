/** @jsxImportSource preact */
/**
 * The date strip (#109; boards 01 and 02, `design/system/components/DateStrip`):
 * the row above the masthead on every public page. On the left a tear-off
 * calendar, the full date with the issue number and the sea state below it,
 * and the yellow wave-count tag; on the right the page's controls (the
 * language menu and the theme switch, passed as children) and the search
 * entry (`SearchEntry`). On phones the full date is read out but not shown, and the tag keeps
 * its short second line. Styles: `DateStrip.css`.
 *
 * Every piece of text is finished text in the page's language: the site
 * formats the date and fills in the counts from data. `@bd/ui` holds no
 * string table and decides no number.
 */
import type { ComponentChildren, VNode } from "preact";
import { SearchEntry } from "../../primitives/SearchEntry/SearchEntry.tsx";

export interface DateStripProps {
  /** The calendar's red header: the month, short ("Nov", "11月"). */
  month: string;
  /** The calendar's big figure: the day of the month ("19"). */
  day: string;
  /** The full date, in the page's language ("Thursday, November 19, 2026"). */
  date: string;
  /** The date as `YYYY-MM-DD`, for `<time datetime>`. */
  dateTime: string;
  /** The line under the date: the issue number and the sea state ("No. 323. Sea state: choppy."). */
  line: string;
  /** The tag's first line: the waves up ("16 waves up"). */
  count: string;
  /** The tag's second line on wide screens ("5 new today, scanned 14:00"). */
  note: string;
  /** The tag's second line on phones ("5 new today"). */
  shortNote: string;
  /** The search link: where it goes and its name ("Search"). */
  search: { href: string; label: string };
  /** The controls before the search link: the language menu and the theme switch. */
  children?: ComponentChildren;
}

export function DateStrip(props: DateStripProps): VNode {
  return (
    <div class="DateStrip">
      <div class="DateStrip-when">
        <span class="DateStrip-calendar" aria-hidden="true">
          <span class="DateStrip-month">{props.month}</span>
          <span class="DateStrip-day">{props.day}</span>
        </span>
        <span class="DateStrip-text">
          <time class="DateStrip-date" datetime={props.dateTime}>
            {props.date}
          </time>
          <span class="DateStrip-line">{props.line}</span>
        </span>
        <span class="DateStrip-tag">
          <strong class="DateStrip-count">{props.count}</strong>
          <span class="DateStrip-note">{props.note}</span>
          <span class="DateStrip-short">{props.shortNote}</span>
        </span>
      </div>
      <div class="DateStrip-controls">
        {props.children}
        <SearchEntry href={props.search.href} label={props.search.label} />
      </div>
    </div>
  );
}
