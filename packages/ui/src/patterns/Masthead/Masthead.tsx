/** @jsxImportSource preact */
/**
 * The masthead every public page opens with (`design/system/components/
 * Masthead`, boards 01 to 23, #110): a row of tools (the language menu, the
 * theme switch), then the One ink round mark and the wordmark as one link to
 * the front page, the navigation, and under them a wave line with a small
 * sailboat riding it. On phones the navigation folds into a "Sections"
 * disclosure, which opens without JavaScript. Not an island: the wave and
 * the boat move by CSS alone, and stand still under reduced motion.
 * Styles: `Masthead.css`.
 */
import type { ComponentChildren, VNode } from "preact";

export interface MastheadLink {
  href: string;
  /** The item's name, in the page's language. */
  label: string;
  /** The page this masthead is on: bold, with the red line under it. */
  current?: boolean;
}

export interface MastheadProps {
  /** The front page in the page's language: where the mark and the wordmark link to. */
  home: string;
  /** The wordmark: "Breaker Delta" in every language (design system "文字"). */
  name: string;
  /** The sections, in order. At most one is `current`. */
  links: readonly MastheadLink[];
  /** The navigation's accessible name, in the page's language ("Main"). */
  navLabel: string;
  /** The phone disclosure's button text, in the page's language ("Sections"). */
  sectionsLabel: string;
  /**
   * The wordmark is the page's `<h1>`: on the front page, whose title is the
   * site's name. Other pages have a heading of their own and leave it out.
   */
  heading?: boolean;
  /** The row above the wordmark, at its end: the language menu, the theme switch. */
  tools?: ComponentChildren;
  /**
   * Starts the phone disclosure open. It opens by a click, so the catalog
   * gives its open state as this prop (ADR 0020, section 12); pages leave it out.
   */
  open?: boolean;
}

/** The round mark's clip. One masthead per page, so one id. */
const CLIP = "Masthead-clip";

// The One ink mark of `apps/web/src/core/icon.ts` (`oneInkMark`, design
// system `Icon`), at its medium detail on the 512 grid: no railing, thicker
// lines. The two parts marked `Masthead-detail` are the ones the small
// drawing leaves out; phones hide them ("圆章 34px（最简画法）").
// `apps/web/src/core/icon.test.ts` checks every shape against `icon.ts`.
const TOWER = "190,380 214,168 298,168 322,380";
const FAR_WAVE =
  "M-20,372 C10,356 40,338 70,336 C110,334 150,356 190,384 C215,400 240,408 270,408 " +
  "C330,408 380,396 430,376 C470,360 500,352 532,350";
const CREST =
  "M-20,404 C24,394 62,362 92,326 C108,306 130,292 150,296 C164,299 168,312 158,320 " +
  "C146,330 140,348 146,366 C156,392 194,416 240,420 C300,424 340,440 396,438 " +
  "C450,436 492,404 532,372";
const TO_BOTTOM = " L532,532 L-20,532 Z";

function Mark(): VNode {
  return (
    <svg class="Masthead-mark" viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <clipPath id={CLIP}>
          <circle cx="256" cy="256" r="236" />
        </clipPath>
      </defs>
      <g clip-path={`url(#${CLIP})`}>
        <rect class="Masthead-paper" x="0" y="0" width="512" height="512" />
        <path
          class="Masthead-line"
          d="M256,124 L-20,62 L-20,194 Z M256,124 L532,62 L532,194 Z"
          stroke-width="8"
          stroke-linejoin="round"
        />
        <polygon class="Masthead-ink" points="178,376 334,376 368,436 144,436" />
        <polygon class="Masthead-paper" points={TOWER} />
        <polygon class="Masthead-ink" points="207.9,222 304.1,222 315.9,326 196.1,326" />
        <polygon
          class="Masthead-crest Masthead-detail"
          points="256,240 290,308 222,308"
          stroke-width="11"
          stroke-linejoin="round"
        />
        <polygon class="Masthead-line" points={TOWER} stroke-width="8" stroke-linejoin="round" />
        <rect
          class="Masthead-paper Masthead-edge"
          x="222"
          y="104"
          width="68"
          height="46"
          stroke-width="10"
        />
        <path class="Masthead-line Masthead-detail" d="M256,104 V150" stroke-width="7" />
        <rect class="Masthead-ink" x="196" y="156" width="120" height="14" />
        <polygon class="Masthead-ink" points="202,106 256,60 310,106" />
        <path class="Masthead-line" d="M256,62 V36" stroke-width="9" stroke-linecap="round" />
        <path class="Masthead-paper" d={FAR_WAVE + TO_BOTTOM} />
        <path class="Masthead-line" d={FAR_WAVE} stroke-width="8" stroke-linecap="round" />
        <path class="Masthead-ink" d={CREST + TO_BOTTOM} />
        <path
          class="Masthead-ink"
          d={`M-20,478 C50,468 110,488 190,494 C290,502 400,500 532,456${TO_BOTTOM}`}
        />
        <path
          class="Masthead-crest"
          d={CREST}
          stroke-width="16"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>
      <circle class="Masthead-line" cx="256" cy="256" r="240" stroke-width="12" />
    </svg>
  );
}

/**
 * The wave line of boards 01 and 02: a sine of 60-unit periods, 8 units
 * high, on the 44-unit band, from x = -240 to far enough right for the
 * widest page plus the 240 it drifts. Its units are CSS pixels
 * (`Masthead.css`), so it never stretches.
 */
const WAVE = (() => {
  let d = "M-240,34";
  for (let k = 0; k < 36; k++) d += " q15,-8 30,0 t30,0";
  return d;
})();

/** The sailboat of boards 01 and 02, at the boards' scale, its hull on the wave. */
function Boat(): VNode {
  return (
    <svg class="Masthead-boat" viewBox="-20 0 40 44" aria-hidden="true">
      <g class="Masthead-rise">
        <g class="Masthead-pitch">
          <g transform="translate(0 30) scale(0.42)">
            <path class="Masthead-line" d="M0,0 L0,-58" stroke-width="4" />
            <polygon class="Masthead-sail" points="5,-54 5,-8 40,-8" />
            <polygon
              class="Masthead-paper Masthead-edge"
              points="-5,-44 -5,-8 -28,-8"
              stroke-width="4"
              stroke-linejoin="round"
            />
            <path class="Masthead-ink" d="M-38,-2 L38,-2 L26,14 L-26,14 Z" />
          </g>
        </g>
      </g>
    </svg>
  );
}

function links(list: readonly MastheadLink[], className: string): VNode[] {
  return list.map((l) => (
    <a
      key={l.href}
      class={className}
      href={l.href}
      {...(l.current === true ? { "aria-current": "page" } : {})}
    >
      {l.label}
    </a>
  ));
}

export function Masthead(props: MastheadProps): VNode {
  const Title = props.heading === true ? "h1" : "div";
  return (
    <div class="Masthead">
      {props.tools === undefined ? null : <div class="Masthead-tools">{props.tools}</div>}
      <div class="Masthead-row">
        <Title class="Masthead-title">
          <a class="Masthead-home" href={props.home}>
            <Mark />
            <span class="Masthead-name">{props.name}</span>
          </a>
        </Title>
        <nav class="Masthead-nav" aria-label={props.navLabel}>
          {links(props.links, "Masthead-link")}
        </nav>
        <details class="Masthead-sections" open={props.open === true}>
          <summary class="Masthead-button">
            {props.sectionsLabel}
            <svg class="Masthead-chevron" viewBox="0 0 12 8" aria-hidden="true">
              <path d="M1 1 L6 6 L11 1" />
            </svg>
          </summary>
          <nav class="Masthead-list" aria-label={props.navLabel}>
            {links(props.links, "Masthead-item")}
          </nav>
        </details>
      </div>
      <div class="Masthead-wave" aria-hidden="true">
        <svg
          class="Masthead-sea"
          viewBox="0 0 1280 44"
          preserveAspectRatio="xMinYMid slice"
          aria-hidden="true"
        >
          <path class="Masthead-swell" d={WAVE} />
        </svg>
        <div class="Masthead-voyage">
          <Boat />
        </div>
      </div>
    </div>
  );
}
