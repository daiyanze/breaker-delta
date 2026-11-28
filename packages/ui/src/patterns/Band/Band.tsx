/** @jsxImportSource preact */
/**
 * One section of a page (issue #106, design system "版式"): a narrow left
 * rail with the italic section name, and a right column with the content.
 *
 * The front page's band is the one exception ("头版区例外：内容在左，索引在右",
 * #120): with `aside`, the content is on the left and the aside (the index)
 * in the right rail, and the section's name is read out but not shown, as
 * on boards 01 and 02.
 *
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
  /** More of the rail under the note: a link, an illustration (the fading notices' sunset). */
  rail?: ComponentChildren;
  /** The front page's right rail (the index); the name is then not shown. */
  aside?: ComponentChildren;
  /**
   * The name on a `sun` highlight: "look here" (design system, colours).
   * One band on a page at most.
   */
  highlight?: boolean;
  /**
   * One link to where the section goes on ("Open the track record"): under
   * the note on desktop, after the content on phones. Unlike `rail`, it
   * moves below the content on phones (board 02).
   */
  link?: { href: string; text: string };
  children?: ComponentChildren;
}

export function Band(props: BandProps): VNode {
  const headingId = `band-${props.id}`;
  const front = props.aside !== undefined;
  const { link } = props;
  return (
    <section
      class="Band"
      data-variant={front ? "front" : undefined}
      aria-labelledby={headingId}
      {...(link === undefined ? {} : { "data-link": "" })}
    >
      <div class="Band-rail">
        <h2 id={headingId} class="Band-name">
          {props.highlight === true ? <span class="Band-mark">{props.name}</span> : props.name}
        </h2>
        {props.note === undefined ? null : <p class="Band-note">{props.note}</p>}
        {props.rail}
      </div>
      <div class="Band-body">{props.children}</div>
      {front ? <div class="Band-aside">{props.aside}</div> : null}
      {link === undefined ? null : (
        <a class="Band-link" href={link.href}>
          {link.text}
        </a>
      )}
    </section>
  );
}
