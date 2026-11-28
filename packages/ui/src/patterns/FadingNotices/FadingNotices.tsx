/** @jsxImportSource preact */
/**
 * The front page's "Fading notices" section (boards 01 and 02, #122): the
 * waves that are going out, one ebb notice each, in a band whose rail holds
 * a note, a link to the waves that went flat and a sunset. When no wave is
 * going out the section is one sentence. Styles: `FadingNotices.css`.
 */
import type { VNode } from "preact";
import { Notice, type NoticeProps } from "../../primitives/Notice/Notice.tsx";
import { Band } from "../Band/Band.tsx";

export interface FadingNoticesProps {
  /** The section's name in the rail. */
  name: string;
  /** The rail's note, under the name. */
  note: string;
  /** The sunset's accessible name. */
  sunset: string;
  /** The link to the waves that went flat; left out when none did. */
  wentFlat?: { href: string; text: string };
  /** One notice per wave going out, in the order the edition lists them. */
  notices: readonly NoticeProps[];
  /** The one sentence the section is when `notices` is empty. */
  none: string;
}

/** The sun setting over a flat sea (board 01): flat colour with `ink` outlines. */
function Sunset(props: { label: string }): VNode {
  return (
    <svg class="FadingNotices-sunset" viewBox="0 0 240 120" role="img" aria-label={props.label}>
      <path class="FadingNotices-sun" d="M70,84 A50,50 0 0 1 170,84 Z" />
      <path class="FadingNotices-ink" d="M120,14 V24 M62,38 L70,45 M178,38 L170,45 M8,84 H232" />
      <path class="FadingNotices-glint" d="M86,97 H154 M100,108 H140" />
    </svg>
  );
}

export function FadingNotices(props: FadingNoticesProps): VNode {
  if (props.notices.length === 0) {
    return (
      <Band id="fading" name={props.name}>
        <div class="FadingNotices">
          <p class="FadingNotices-none">{props.none}</p>
        </div>
      </Band>
    );
  }
  return (
    <Band
      id="fading"
      name={props.name}
      note={props.note}
      rail={
        <div class="FadingNotices-rail">
          {props.wentFlat === undefined ? null : (
            <a class="FadingNotices-flat" href={props.wentFlat.href}>
              {props.wentFlat.text}
            </a>
          )}
          <Sunset label={props.sunset} />
        </div>
      }
    >
      <div class="FadingNotices">
        <ul class="FadingNotices-list">
          {props.notices.map((n) => (
            <li key={n.href} class="FadingNotices-item">
              <Notice {...n} />
            </li>
          ))}
        </ul>
      </div>
    </Band>
  );
}
