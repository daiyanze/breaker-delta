/** @jsxImportSource preact */
/**
 * Small ticket stubs side by side (#115, board 01's "Were we right?"
 * band): three to a row on desktop, one on phones. A list, so a screen
 * reader counts them. Styles: `TicketStubs.css`.
 */
import type { VNode } from "preact";
import { TicketStub, type TicketStubProps } from "../TicketStub/TicketStub.tsx";

export interface TicketStubsProps {
  /** Each stub, in the order the page lists them. Small stubs only. */
  stubs: readonly (Omit<TicketStubProps, "size"> & { id: string })[];
}

export function TicketStubs(props: TicketStubsProps): VNode {
  return (
    <ul class="TicketStubs">
      {props.stubs.map(({ id, ...stub }) => (
        <li key={id} class="TicketStubs-item">
          <TicketStub {...stub} />
        </li>
      ))}
    </ul>
  );
}
