/** @jsxImportSource preact */
/**
 * One row of the index (#120, `design/system/components/IndexRow`, boards
 * 01 and 02): the rank, the short title, a dotted leader that leads the eye
 * to the right, the change over 24 hours and the wave's height. The whole
 * row is the link to the topic page. A wave formed today has its number and
 * its change in red. Styles: `IndexRow.css`.
 *
 * It imports nothing but types, so the index island (`Index.island.tsx`)
 * can carry it to the browser.
 */
import type { VNode } from "preact";

export interface IndexRowProps {
  /** The topic page. */
  href: string;
  /** The wave's place in the ranking, from 1. */
  rank: number;
  /** The short title, in its own language. */
  title: { lang: string; text: string };
  /** The wave's height, as `@bd/core` computed it. */
  height: number;
  /** The wave formed today: its number and its change are red. */
  formedToday: boolean;
  /** The change over 24 hours as shown, "new", "+63%" or "−18%"; empty when level. */
  change: string;
}

export function IndexRow(props: IndexRowProps): VNode {
  const red = props.formedToday ? " IndexRow-new" : "";
  return (
    <a class="IndexRow" href={props.href}>
      <span class="IndexRow-rank">{props.rank}</span>
      <span class="IndexRow-title" lang={props.title.lang}>
        {props.title.text}
      </span>
      <span class="IndexRow-leader" aria-hidden="true" />
      <span class={`IndexRow-change${red}`}>{props.change}</span>
      <data class={`IndexRow-number${red}`} value={props.height}>
        {Math.round(props.height)}
      </data>
    </a>
  );
}
