/** @jsxImportSource preact */
/**
 * One section of a page (issue #106, design system "版式"): a narrow left
 * rail with the italic section name, and a right column with the content.
 *
 * The front page's band is the one exception ("头版区例外：内容在左，索引在右",
 * #120): with `aside`, the content is on the left and the aside (the index)
 * in the right rail, and the section's name is read out but not shown, as
 * on boards 01 and 02. Styles: `Band.css`.
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
  /** The front page's right rail (the index); the name is then not shown. */
  aside?: ComponentChildren;
  children?: ComponentChildren;
}

export function Band(props: BandProps): VNode {
  const headingId = `band-${props.id}`;
  const front = props.aside !== undefined;
  return (
    <section class="Band" data-variant={front ? "front" : undefined} aria-labelledby={headingId}>
      <div class="Band-rail">
        <h2 id={headingId} class="Band-name">
          {props.name}
        </h2>
        {props.note === undefined ? null : <p class="Band-note">{props.note}</p>}
        {props.rail}
      </div>
      <div class="Band-body">{props.children}</div>
      {front ? <div class="Band-aside">{props.aside}</div> : null}
    </section>
  );
}
