/** @jsxImportSource preact */
/**
 * The notice (design system component Notice, boards 01 and 02, #122): a
 * small double-ruled box, as a newspaper prints a notice. This is its ebb
 * form: a ripple on top whose amplitude follows the wave's height, the
 * topic's name, an obituary-style sentence and a bold line with the wave's
 * height now. Styles: `Notice.css`.
 */
import type { VNode } from "preact";
import { RIPPLE } from "../../tokens/index.ts";

/** The ripple's drawing board, as on boards 01 and 02: 240 × 40. */
const BOARD = { width: 240, height: 40 } as const;
/** The ripple's line sits in the middle of the board. */
const BASELINE = BOARD.height / 2;
/** One crest and one trough of the ripple, in board units (boards 01 and 02). */
const PERIOD = 60;
/** The tallest amplitude whose crest and trough still fit on the board with the line's width. */
const MAX_AMPLITUDE = BOARD.height - 6;

/**
 * The ripple's amplitude for a wave of `height` (design system README,
 * "启事波纹振幅"): height ÷ 200 × 16, at least 2. Capped where the line
 * would leave the board, which no height the design draws reaches.
 */
export function rippleAmplitude(height: number): number {
  const amplitude = (height / RIPPLE.per) * RIPPLE.scale;
  return Math.min(MAX_AMPLITUDE, Math.max(RIPPLE.min, amplitude));
}

/**
 * The ripple's path: a line of quadratic curves from one board's width to
 * the left of the board to two to the right, so it can drift left by one
 * board's width and start again without a seam. A curve's control point is
 * `amplitude` off the line, so the line itself swings half of it each way.
 */
export function ripplePath(amplitude: number): string {
  const half = PERIOD / 2;
  const a = Number(amplitude.toFixed(2));
  let d = `M${-BOARD.width},${BASELINE}`;
  for (let x = -BOARD.width; x < 2 * BOARD.width; x += PERIOD) {
    d += ` q${half / 2},${-a} ${half},0 t${half},0`;
  }
  return d;
}

export interface NoticeProps {
  /** The topic's name, in its own language (`lang`, BCP 47). */
  title: { text: string; lang: string };
  /** The topic's page. */
  href: string;
  /** The obituary-style sentence, finished, in the page's language. */
  text: string;
  /** The bold last line: the height now and its 24-hour fall, finished. */
  now: string;
  /** The wave's height now, which sets the ripple's amplitude, and the ripple's accessible name. */
  ripple: { height: number; label: string };
}

export function Notice(props: NoticeProps): VNode {
  return (
    <article class="Notice">
      <svg
        class="Notice-ripple"
        viewBox={`0 0 ${BOARD.width} ${BOARD.height}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={props.ripple.label}
      >
        <path class="Notice-ripple-line" d={ripplePath(rippleAmplitude(props.ripple.height))} />
      </svg>
      <h3 class="Notice-title">
        <a class="Notice-link" href={props.href} lang={props.title.lang}>
          {props.title.text}
        </a>
      </h3>
      <p class="Notice-text">{props.text}</p>
      <p class="Notice-now">{props.now}</p>
    </article>
  );
}
