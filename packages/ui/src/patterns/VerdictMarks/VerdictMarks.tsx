/** @jsxImportSource preact */
/**
 * Every registered wave as a verdict mark, oldest first, with the legend
 * under them (#115, board 07's "Every wave so far"; VerdictMark README: the
 * legend is required). Fourteen marks to a row on desktop, ten on phones.
 * Styles: `VerdictMarks.css`.
 */
import type { VNode } from "preact";
import { MARK_KINDS, type MarkKind, VerdictMark } from "../VerdictMark/VerdictMark.tsx";

export interface VerdictMarksProps {
  /** The marks' accessible name in the page's language: "41 waves, oldest first". */
  label: string;
  /** One per registered prediction, oldest first. */
  marks: readonly { id: string; mark: MarkKind }[];
  /**
   * Each kind's name in the page's language ("hit", "under review"): the
   * legend's text, and each mark's accessible name.
   */
  legend: { readonly [K in MarkKind]: string };
}

export function VerdictMarks(props: VerdictMarksProps): VNode {
  return (
    <div class="VerdictMarks">
      <ol class="VerdictMarks-list" aria-label={props.label}>
        {props.marks.map((m) => (
          <li key={m.id}>
            <VerdictMark mark={m.mark} label={props.legend[m.mark]} />
          </li>
        ))}
      </ol>
      <ul class="VerdictMarks-legend">
        {MARK_KINDS.map((kind) => (
          <li key={kind} class="VerdictMarks-key">
            <VerdictMark mark={kind} />
            {props.legend[kind]}
          </li>
        ))}
      </ul>
    </div>
  );
}
