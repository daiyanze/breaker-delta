/** @jsxImportSource preact */
/**
 * One verdict mark (#115, `design/system/components/VerdictMark`): a small
 * round mark for one registered wave on the track record. Six kinds, each
 * a different shape, so none needs its colour to be told apart: a full
 * disc, a ring half filled, a ring with a cross, a dashed ring with a dot,
 * a filled ring and an empty ring. The drawing is board 07's, in a 26 by 26
 * `viewBox`; `VerdictMark.css` gives it its colours and size. Without a
 * `label` it is decoration (in a legend, beside its name).
 */
import type { TrackRecord } from "@bd/contracts";
import type { VNode } from "preact";

/** Where a registered wave's test stands: `TrackRecord["marks"]` in `@bd/contracts`. */
export type MarkKind = TrackRecord["marks"][number]["mark"];

/** Every kind, in the VerdictMark README's order, which the legend follows. */
export const MARK_KINDS: readonly MarkKind[] = [
  "hit",
  "partial",
  "miss",
  "undetermined",
  "under_review",
  "waiting",
];

export interface VerdictMarkProps {
  mark: MarkKind;
  /** The mark's name in the page's language ("hit"); none when text beside it names it. */
  label?: string;
}

/** The shapes of each kind, centred on (13, 13). */
function shapes(mark: MarkKind): VNode {
  switch (mark) {
    case "hit":
      return <circle class="VerdictMark-fill" cx={13} cy={13} r={11} />;
    case "partial":
      return (
        <>
          <circle class="VerdictMark-line" cx={13} cy={13} r={9.75} stroke-width={2.5} />
          <path class="VerdictMark-fill" d="M13,2 A11,11 0 0 0 13,24 Z" />
        </>
      );
    case "miss":
      return (
        <>
          <circle class="VerdictMark-line" cx={13} cy={13} r={9.75} stroke-width={2.5} />
          <path
            class="VerdictMark-line"
            d="M8.5,8.5 L17.5,17.5 M17.5,8.5 L8.5,17.5"
            stroke-width={2.5}
            stroke-linecap="round"
          />
        </>
      );
    case "undetermined":
      return (
        <>
          <circle
            class="VerdictMark-line"
            cx={13}
            cy={13}
            r={10}
            stroke-width={2}
            stroke-dasharray="3 3"
          />
          <circle class="VerdictMark-fill" cx={13} cy={13} r={2} />
        </>
      );
    case "under_review":
      return (
        <circle
          class="VerdictMark-line VerdictMark-filled"
          cx={13}
          cy={13}
          r={10}
          stroke-width={2}
        />
      );
    case "waiting":
      return <circle class="VerdictMark-line" cx={13} cy={13} r={10} stroke-width={2} />;
  }
}

export function VerdictMark(props: VerdictMarkProps): VNode {
  if (props.label === undefined) {
    return (
      <svg class="VerdictMark" data-mark={props.mark} viewBox="0 0 26 26" aria-hidden="true">
        {shapes(props.mark)}
      </svg>
    );
  }
  return (
    <svg
      class="VerdictMark"
      data-mark={props.mark}
      viewBox="0 0 26 26"
      role="img"
      aria-label={props.label}
    >
      {shapes(props.mark)}
    </svg>
  );
}
