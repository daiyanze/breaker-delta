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
 * The tide table's chart (#121): boards 01 and 02 draw it in an SVG 270
 * high (`viewBox="0 0 860 270"`), the sea surface with `stroke-width: 3`
 * and each wave's dot with `r="5.5"` (board 01). The design system names
 * none of them. `tokens.test.ts` checks that board 01 still says so.
 */
export const TIDE = {
  height: "270px",
  surface: "3px",
  dot: "5.5px",
} as const;

/**
 * Below this width a band is one column: the rail becomes a heading above
 * the content. The design system names no breakpoint; this is the agent's
 * choice (#106): the narrowest width where the rail at its full `rail` width,
 * the `space-8` gap and a content column of about 480px still fit.
 */
export const TWO_COLUMNS_FROM = "960px";
