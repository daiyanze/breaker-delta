/** @jsxImportSource preact */
/**
 * The echo stack (#114, `design/system/components/EchoStack`): a stack of
 * thin rounded sheets beside a wave-height number, one sheet per 200 ÷ 12
 * of height. The sheets drop in one after another on a 7-second loop; with
 * reduced motion, and at rest, the whole stack shows. Nothing is drawn on
 * top of it. Styles: `EchoStack.css`.
 *
 * The geometry is the boards' (01, 02, 03), in the units of their
 * `viewBox="0 0 120 220"`: each sheet 11 high with a gap of 3, narrower and
 * a little further right the higher it sits, on a baseline rule.
 */
import type { VNode } from "preact";

/** The fewest sheets a stack has: component README, "最少 3 层". */
export const MIN_LAYERS = 3;

/**
 * The most sheets the boards' frame holds: the 15th sits 3 units below the
 * top of the 220-unit `viewBox`, a 16th would leave it. A taller wave keeps
 * the full frame.
 */
export const MAX_LAYERS = 15;

/** Sheets for a height: height ÷ 200 × 12, rounded, at least 3 and at most 15. */
export function echoStackLayers(height: number): number {
  const layers = Number.isFinite(height) ? Math.round((height / 200) * 12) : MAX_LAYERS;
  return Math.min(MAX_LAYERS, Math.max(MIN_LAYERS, layers));
}

/** One sheet's box in `viewBox` units; `k` counts from the bottom, from 0. */
export function sheet(k: number): { x: number; y: number; width: number } {
  const width = Math.round(100 - k * 5.6);
  const centre = 54 + k * 1.6;
  return { x: Math.round((centre - width / 2) * 10) / 10, y: 212 - (k + 1) * 14 + 1, width };
}

export interface EchoStackProps {
  /** The wave's height, as `@bd/core` computed it. */
  height: number;
  /**
   * What the stack shows, read out in place of the picture: finished text in
   * the page's language that names the number of sheets
   * (`echoStackLayers(height)`).
   */
  label: string;
}

export function EchoStack(props: EchoStackProps): VNode {
  const layers = echoStackLayers(props.height);
  const sheets = Array.from({ length: layers }, (_, k) => {
    const box = sheet(k);
    const tone = k === layers - 1 ? "top" : k % 2 === 0 ? "blue" : "sky";
    return (
      <rect
        key={k}
        class={`EchoStack-sheet EchoStack-${tone}`}
        x={box.x}
        y={box.y}
        width={box.width}
        height={11}
        rx={5.5}
      />
    );
  });
  return (
    <svg class="EchoStack" viewBox="0 0 120 220" role="img" aria-label={props.label}>
      {sheets}
      <path class="EchoStack-base" d="M2,214 H118" />
    </svg>
  );
}
