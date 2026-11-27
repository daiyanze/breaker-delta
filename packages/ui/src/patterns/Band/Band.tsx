/** @jsxImportSource preact */
/**
 * One section of a page (issue #106, design system "版式"): a narrow left
 * rail with the italic section name, and a right column with the content.
 * Styles: `Band.css`.
 */
import type { ComponentChildren, VNode } from "preact";

export interface BandProps {
  /** Unique on the page; the section name's element id is `band-<id>`. */
  id: string;
  /** The section name in the rail. */
  name: string;
  /** One sentence under the name. */
  note?: string;
  /** More of the rail under the note: a link, an illustration (the fading notices' sunset). */
  rail?: ComponentChildren;
  children?: ComponentChildren;
}

export function Band(props: BandProps): VNode {
  const headingId = `band-${props.id}`;
  return (
    <section class="Band" aria-labelledby={headingId}>
      <div class="Band-rail">
        <h2 id={headingId} class="Band-name">
          {props.name}
        </h2>
        {props.note === undefined ? null : <p class="Band-note">{props.note}</p>}
        {props.rail}
      </div>
      <div class="Band-body">{props.children}</div>
    </section>
  );
}
