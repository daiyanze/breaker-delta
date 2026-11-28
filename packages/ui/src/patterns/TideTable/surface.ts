/**
 * The tide table's sea surface (#121, design system "数据驱动的规则"): each
 * wave formed today adds a bell-shaped swell at the hour it formed, and the
 * sum is scaled to its highest point. Pure: hours in, path data out.
 *
 * Coordinates: x is the hour of the day times `PER_HOUR`, and y is in
 * pixels from the chart's top, `TIDE.height` high. The chart stretches x to
 * its width (`preserveAspectRatio="none"`) and never y, so the text beside
 * it keeps its size at every width. An hour is `PER_HOUR` units, about its
 * width in pixels, not 1: the rising surface is a composited layer, drawn
 * at the size of its own units and then stretched, so at 1 unit an hour
 * its slopes come out in steps. The numbers below are board 01's
 * (`design/boards/Front2.dc.html`, `renderVals`).
 */
import { TIDE } from "../../tokens/index.ts";

export const HOURS = 24;
/** Units an hour across, near board 01's 32.5px an hour. */
export const PER_HOUR = 40;
/** The chart's height in pixels: the inner chart's `viewBox` height. */
export const HEIGHT = Number.parseFloat(TIDE.height);
/** The waterline: the thick rule the sea stands on, and the hour ticks' top. */
export const WATERLINE = 226;
/** Where the surface lies with nothing formed: just above the waterline. */
const REST = 220;
/** How far the highest point rises above `REST`. */
const RANGE = 140;
/** The swell's width: `exp(-(h - formed)^2 / 2.6)`. */
const SPREAD = 2.6;
/** A small ripple on the surface, so a calm stretch is still sea. */
const RIPPLE = 3;
const RIPPLE_PER_HOUR = 2.5;
/** Hours between the points the surface passes through. */
const STEP = 0.25;

/** One wave's swell: the hour it formed (0 to 24) and its height now. */
export interface Swell {
  hour: number;
  height: number;
}

/** The sum of every swell at hour `h`. */
export function swellAt(swells: readonly Swell[], h: number): number {
  return swells.reduce((sum, s) => sum + s.height * Math.exp(-((h - s.hour) ** 2) / SPREAD), 0);
}

/**
 * The highest point of the swell between midnight and `now`, on the
 * quarter hour: its hour and its level. With nothing formed it is `now`,
 * at level 1, so the scale never divides by zero.
 */
export function highWater(swells: readonly Swell[], now: number): { hour: number; level: number } {
  let best = { hour: now, level: 1 };
  for (let h = 0; h <= now; h += STEP) {
    const level = swellAt(swells, h);
    if (level > best.level) best = { hour: h, level };
  }
  return best;
}

/** The surface's height in pixels from the top at hour `h`, scaled to `peak`. */
export function seaY(swells: readonly Swell[], peak: number, h: number): number {
  const y = REST - (swellAt(swells, h) / peak) * RANGE - RIPPLE * Math.sin(h * RIPPLE_PER_HOUR);
  return Math.round(y * 10) / 10;
}

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/**
 * The surface from midnight to `now` as one smooth curve: a cubic Bézier
 * through points a quarter hour apart or less, each segment's tangents
 * those of its neighbours (Catmull-Rom), so it has no corner. Only `M` and
 * `C` commands: no straight line, no vertical.
 */
export function surfacePath(swells: readonly Swell[], peak: number, now: number): string {
  const n = Math.max(1, Math.ceil(now / STEP));
  const points = Array.from({ length: n + 1 }, (_, i) => {
    const h = (now * i) / n;
    return [h, seaY(swells, peak, h)] as const;
  });
  const at = (i: number) => points[Math.min(Math.max(i, 0), n)] as readonly [number, number];
  const xy = (p: readonly [number, number]) => `${round(p[0] * PER_HOUR, 1)},${round(p[1], 1)}`;
  let d = `M${xy(at(0))}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6] as const;
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6] as const;
    d += ` C${xy(c1)} ${xy(c2)} ${xy(p2)}`;
  }
  return d;
}

/** The sea under the surface: the surface, then down to the waterline and back. */
export function areaPath(surface: string, now: number): string {
  return `${surface} L${round(now * PER_HOUR, 1)},${WATERLINE} L0,${WATERLINE} Z`;
}

/** An hour as a share of the chart's width, for the parts drawn in pixels. */
export function across(h: number): string {
  return `${round((h / HOURS) * 100, 3)}%`;
}

/** An hour of the day as `HH:MM`, rounded to the minute. */
export function clock(h: number): string {
  const minutes = Math.round(h * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** A wave's height sits this far from its dot's centre (the text's baseline): above, or below. */
export const ABOVE = -13;
export const BELOW = 25;
/** A height label's size in chart terms: hours across (enough at 20px an hour), pixels up. */
const LABEL_HOURS = 1.5;
const LABEL_HEIGHT = 17;
/** A dot's radius and its outline, with a pixel to spare. */
const DOT_REACH = 7;

/**
 * Where each wave's height goes, as an offset from its dot: above and below
 * by turns, in the order the waves formed (boards 01 and 02), unless that
 * spot overlaps a label already placed or another wave's dot and the other
 * side is clear; then the other side.
 */
export function labelOffsets(dots: readonly { hour: number; y: number }[]): number[] {
  const placed: { hour: number; y: number }[] = [];
  const clear = (dot: { hour: number }, self: number, y: number) =>
    placed.every(
      (p) => Math.abs(p.hour - dot.hour) >= LABEL_HOURS || Math.abs(p.y - y) >= LABEL_HEIGHT,
    ) &&
    dots.every(
      (d, j) =>
        j === self ||
        Math.abs(d.hour - dot.hour) >= LABEL_HOURS / 2 ||
        d.y + DOT_REACH < y - LABEL_HEIGHT ||
        d.y - DOT_REACH > y,
    );
  return dots.map((dot, i) => {
    const [first, second] = i % 2 === 0 ? [ABOVE, BELOW] : [BELOW, ABOVE];
    const offset = !clear(dot, i, dot.y + first) && clear(dot, i, dot.y + second) ? second : first;
    placed.push({ hour: dot.hour, y: dot.y + offset });
    return offset;
  });
}
