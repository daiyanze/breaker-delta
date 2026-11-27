/**
 * The values the components need that `design/system/tokens.json` does not
 * hold (ADR 0020, section 5): the design states them only in prose, or not
 * at all. Each names the text it comes from. They move into the generated
 * tokens when the design export carries them. No other file of this layer
 * holds a design value.
 */
import type { SpaceToken, TypeStyle } from "./tokens.gen.ts";

/**
 * The two phone values the design states in the `usage` of the token they
 * replace on phones (`tokens.json`). `tokens.test.ts` checks that each usage
 * still says so.
 */
export const PHONE = {
  /** Page side margin: `space-6` "手机用 20px". */
  gutter: { value: "20px", token: "space-6" },
  /** Section name in the rail: `section` "手机 32px". */
  sectionSize: { value: "32px", token: "section" },
} as const satisfies Record<string, { value: string; token: SpaceToken | TypeStyle }>;

/**
 * A control's height: `design/system/components/Button/README.md`,
 * "高度不小于 44px，桌面默认 48px" (at least 44px; 48px on desktop by default).
 * `tokens.test.ts` checks that the README still says so.
 */
export const CONTROL = {
  minHeight: "44px",
  height: "48px",
} as const;

/**
 * Interface icons: design system README, "图标": "线宽约 1.8px，18px 画板"
 * (a stroke of about 1.8px on an 18px board). The theme switch's icon is
 * the one exception, 20 × 20 inside the square button on boards 01 and 02
 * (`<svg width="20" height="20">`). `tokens.test.ts` checks that the README
 * and both boards still say so.
 */
export const ICON = {
  size: "18px",
  stroke: "1.8px",
  themeSwitch: "20px",
} as const;

/**
 * The masthead (`design/system/components/Masthead/README.md`, #110), from
 * its README and the `masthead` type style's usage in `tokens.json`
 * ("桌面 clamp(56px, 7.4vw, 104px)，手机 38px"; the 104px is the style's own
 * size). `tokens.test.ts` checks that both still say so.
 *
 * - `wordmarkMin`, `wordmarkFluid`: the desktop wordmark's lower bound and
 *   its size relative to the viewport.
 * - `wordmarkPhone`: "字标 38px 单行" (the phone wordmark, one line).
 * - `markPhone`: "圆章 34px（最简画法）" (the phone mark, simplest drawing).
 * - `markSize`: "高度是字标字号的 0.84 倍" (the mark is 0.84 times the
 *   wordmark's size).
 * - `markGap`: "间距 0.14em" (between the mark and the wordmark).
 * - `waveStroke`: "3.5px `ink` 描边的正弦线" (the wave line's stroke).
 * - `waveDrift`, `waveLoop`: "30 秒向左流动 240px" (the wave moves left 240px
 *   in 30 seconds, four of its 60px periods, so the loop has no seam).
 * - `boatRise`, `boatPitch`, `boatBeat`: "每 2.5 秒越过一个浪，上下 ±3.5px、
 *   俯仰 ±5°" (the boat crosses a wave every 2.5 seconds, ±3.5px up and
 *   down, ±5° in pitch).
 *
 * Not in the README, from boards 01 and 02 (agent's choice to take them as
 * drawn, #110): `waveHeight`, the 44px the wave and the boat are drawn in;
 * `sailPhone` and `sailDesktop`, the time the boat takes to cross, 30s on
 * the phone board's 390px and 87.5s on the desktop board's 1280px. CSS
 * cannot divide a width by a speed, so the README's "每秒 16px" (16px a
 * second) holds at those widths and is close between them.
 */
export const MASTHEAD = {
  wordmarkMin: "56px",
  wordmarkFluid: "7.4vw",
  wordmarkPhone: "38px",
  markPhone: "34px",
  markSize: "0.84em",
  markGap: "0.14em",
  waveStroke: "3.5px",
  waveDrift: "240px",
  waveLoop: "30s",
  waveHeight: "44px",
  boatRise: "3.5px",
  boatPitch: "5deg",
  boatBeat: "2.5s",
  sailPhone: "30s",
  sailDesktop: "87.5s",
} as const;

/**
 * The echo stack beside a wave-height number (#114): boards 01 and 03 draw
 * it `width: 92px; height: 168px`, board 02 (phones) `width: 68px; height:
 * 125px`, both over a `viewBox="0 0 120 220"`, so the height follows from
 * the width. The motion is the component README's: "每层间隔 0.14 秒" (one
 * sheet every 0.14 s) and "7 秒一个循环" (a 7-second loop). `tokens.test.ts`
 * checks that the boards and the README still say so.
 */
export const ECHO_STACK = {
  width: "92px",
  phoneWidth: "68px",
  loop: "7s",
  step: "0.14s",
} as const;

/**
 * Below this width a band is one column: the rail becomes a heading above
 * the content. The design system names no breakpoint; this is the agent's
 * choice (#106): the narrowest width where the rail at its full `rail` width,
 * the `space-8` gap and a content column of about 480px still fit.
 */
export const TWO_COLUMNS_FROM = "960px";
