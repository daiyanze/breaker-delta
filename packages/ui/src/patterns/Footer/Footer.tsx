/** @jsxImportSource preact */
/**
 * The footer every public page ends with (boards 01 and 02, #111): the
 * subscribe form and a column of links, then the lighthouse illustration
 * (three layers of waves drifting, a sailboat riding them, the beam
 * sweeping back and forth), then a solid bar of short notes. The form is
 * left out when the page passes none: the site hides it when no delivery
 * method is set up (#81). Its answers (sending, sent, errors) are #145.
 * Not an island: the motion is CSS only. Styles: `Footer.css`.
 */
import type { VNode } from "preact";
import { useId } from "preact/hooks";

export interface FooterLink {
  href: string;
  /** The link's text, in the page's language. */
  label: string;
  /** A shorter text for phones, where two links share a row; `label` when left out. */
  short?: string;
}

export interface FooterSubscribe {
  /** Where the form posts. */
  action: string;
  /** The field's label, the footer's heading line: "One email a day, with the new waves." */
  label: string;
  /** The field's placeholder, an example address. */
  placeholder: string;
  /** The button's text: "Subscribe". */
  button: string;
}

export interface FooterProps {
  /** The subscribe form; left out when the site sends no email. */
  subscribe?: FooterSubscribe;
  /** The links' landmark name: "Footer". */
  navLabel: string;
  links: readonly FooterLink[];
  /** The illustration's accessible name. */
  art: string;
  /** The bar's short lines, first one at the start: "Breaker Delta is open source." */
  notes: readonly string[];
}

/**
 * One wave layer (board 01's `wave()`): a sine of 12 periods 240 wide from
 * x = -480, so a drift of one period (`Footer.css`) loops without a seam;
 * closed down to the bottom of the view unless it is a line.
 */
function wave(y: number, amp: number, closed: boolean): string {
  let d = `M-480,${y}`;
  for (let k = 0; k < 12; k++) d += ` q60,${-amp} 120,0 t120,0`;
  return closed ? `${d} V380 H-480 Z` : d;
}

const WAVE_BACK = wave(262, 14, true);
const WAVE_MID = wave(288, 18, true);
const WAVE_FRONT = wave(320, 16, true);
const HATCH = wave(352, 7, false);

function Art(props: { label: string }): VNode {
  // Board 01's drawing, in the view box's units. The right beam runs past
  // the view's edge (board: to 1440; here to 1520 on the same two lines), so its end never shows in the sweep.
  return (
    <div class="Footer-art">
      <svg class="Footer-svg" viewBox="0 -130 1440 510" role="img" aria-label={props.label}>
        <g class="Footer-beam">
          <polygon points="1132,92 300,6 300,168" />
          <polygon points="1132,92 1520,57 1520,137" />
        </g>
        <path
          class="Footer-gulls"
          stroke-width="2.5"
          d="M560,74 q10,-11 20,0 q10,-11 20,0 M640,112 q8,-9 16,0 q8,-9 16,0 M880,54 q9,-10 18,0 q9,-10 18,0"
        />
        <path
          class="Footer-solid"
          d="M1000,310 C1034,252 1086,236 1132,236 C1182,236 1236,256 1268,310 Z"
        />
        <polygon
          class="Footer-tower"
          stroke-width="3"
          points="1108,236 1118,110 1146,110 1156,236"
        />
        <polygon class="Footer-red" points="1114.8,150 1149.2,150 1151.2,176 1112.8,176" />
        <polygon class="Footer-red" points="1110.7,202 1153.3,202 1155.4,228 1108.6,228" />
        <rect
          class="Footer-solid Footer-edge"
          stroke-width="1.5"
          x="1108"
          y="104"
          width="48"
          height="8"
        />
        <rect class="Footer-lamp" stroke-width="3" x="1121" y="80" width="22" height="24" />
        <polygon
          class="Footer-solid Footer-edge"
          stroke-width="1.5"
          points="1114,80 1132,58 1150,80"
        />
        <g class="Footer-drift Footer-drift-back">
          <path class="Footer-sky" d={WAVE_BACK} />
        </g>
        <g transform="translate(430 250)">
          <g class="Footer-boat">
            <path class="Footer-mast" stroke-width="3" d="M0,0 L0,-58" />
            <polygon class="Footer-red" points="5,-54 5,-8 40,-8" />
            <polygon class="Footer-jib" stroke-width="2.5" points="-5,-44 -5,-8 -28,-8" />
            <path
              class="Footer-solid Footer-edge"
              stroke-width="1.5"
              d="M-38,-2 L38,-2 L26,14 L-26,14 Z"
            />
          </g>
        </g>
        <g transform="translate(-90 0)">
          <g class="Footer-drift Footer-drift-mid">
            <path class="Footer-blue" d={WAVE_MID} />
          </g>
        </g>
        <g class="Footer-drift Footer-drift-front">
          <path class="Footer-solid" d={WAVE_FRONT} />
          <path class="Footer-hatch" stroke-width="1.5" d={HATCH} />
        </g>
      </svg>
    </div>
  );
}

export function Footer(props: FooterProps): VNode {
  const form = props.subscribe;
  // Ties the label to its field, unique per footer on the page (the catalog shows several).
  const fieldId = `footer-email-${useId()}`;
  return (
    <footer class="Footer">
      <div class="Footer-top">
        {form === undefined ? null : (
          <form class="Footer-form" method="post" action={form.action}>
            <label class="Footer-label" for={fieldId}>
              {form.label}
            </label>
            <input
              class="Footer-field"
              id={fieldId}
              name="email"
              type="email"
              autocomplete="email"
              required
              placeholder={form.placeholder}
            />
            <button class="Footer-submit" type="submit">
              {form.button}
            </button>
          </form>
        )}
        <nav class="Footer-nav" aria-label={props.navLabel}>
          {props.links.map((l) => (
            <a key={l.href} class="Footer-link" href={l.href}>
              {l.short === undefined || l.short === l.label ? (
                l.label
              ) : (
                <>
                  <span class="Footer-long">{l.label}</span>
                  <span class="Footer-short">{l.short}</span>
                </>
              )}
            </a>
          ))}
        </nav>
      </div>
      <Art label={props.art} />
      <div class="Footer-bar">
        <div class="Footer-notes">
          {props.notes.map((n) => (
            <span key={n} class="Footer-note">
              {n}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
