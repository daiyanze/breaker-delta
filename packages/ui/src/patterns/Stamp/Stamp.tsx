/** @jsxImportSource preact */
/**
 * The stamp on a ticket stub (#115, `design/system/components/TicketStub`):
 * where a 14-day test stands. Six kinds, told apart by their text and their
 * frame (solid, dashed, filled, turned or not), never by colour alone. On
 * hover it wobbles once. Styles: `Stamp.css`.
 */
import type { VNode } from "preact";

/**
 * Where a test stands: not due yet, a verdict waiting for a person, or the
 * confirmed outcome (`OutcomeSchema` in `@bd/contracts`).
 */
export type StampKind = "due" | "under_review" | "hit" | "partial" | "miss" | "undetermined";

/** Every kind, in the order the TicketStub README lists them. */
export const STAMP_KINDS: readonly StampKind[] = [
  "due",
  "under_review",
  "hit",
  "partial",
  "miss",
  "undetermined",
];

export interface StampProps {
  kind: StampKind;
  /** The stamp's text in the page's language: "Due Nov 26", "Hit". */
  label: string;
  /**
   * A due stamp on the front and topic pages: a red frame, turned -5°, so it
   * stands out (TicketStub README). The track record's ledger leaves it out.
   * Only a due stamp takes it.
   */
  loud?: boolean;
}

export function Stamp(props: StampProps): VNode {
  const loud = props.loud === true && props.kind === "due";
  return (
    <span class="Stamp" data-kind={props.kind} {...(loud ? { "data-loud": "" } : {})}>
      {props.label}
    </span>
  );
}
