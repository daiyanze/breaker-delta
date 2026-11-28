/** @jsxImportSource preact */
/**
 * One section of a page (issue #106, design system "版式"): a narrow left
 * rail with the italic section name, and a right column with the content.
 * A band may mark its name with `sun` ("栏目名高亮", #123) and end with one
 * link to more, under the note on desktop and after the content on phones
 * (boards 01 and 02). Styles: `Band.css`.
 */
import type { ComponentChildren, VNode } from "preact";

export interface BandProps {
  /** Unique on the page; the section name's element id is `band-<id>`. */
  id: string;
  /** The section name in the rail. */
  name: string;
  /** One sentence under the name. */
  note?: string;
  /**
   * The name on a `sun` highlight: "look here" (design system, colours).
   * One band on a page at most.
   */
  highlight?: boolean;
  /** One link to where the section goes on: "Open the track record". */
  link?: { href: string; text: string };
  children?: ComponentChildren;
}

export function Band(props: BandProps): VNode {
  const headingId = `band-${props.id}`;
  const { link } = props;
  return (
    <section
      class="Band"
      aria-labelledby={headingId}
      {...(link === undefined ? {} : { "data-link": "" })}
    >
      <div class="Band-rail">
        <h2 id={headingId} class="Band-name">
          {props.highlight === true ? <span class="Band-mark">{props.name}</span> : props.name}
        </h2>
        {props.note === undefined ? null : <p class="Band-note">{props.note}</p>}
      </div>
      <div class="Band-body">{props.children}</div>
      {link === undefined ? null : (
        <a class="Band-link" href={link.href}>
          {link.text}
        </a>
      )}
    </section>
  );
}
