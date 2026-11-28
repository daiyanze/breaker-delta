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
 * The stamp on a ticket stub (#115): `design/system/components/TicketStub/README.md`,
 * "印章：3px 框" (a 3px frame), "旋转 -4°" (turned -4°) for a verdict, and
 * "待到期的章用 `red` 框并旋转 -5°" on the front and topic pages. Its hover
 * is the design system README's motion list, "悬停时印章晃一下 | 0.2 秒"
 * (the stamp wobbles once, 0.2 seconds), swinging to the turn and size that
 * boards 01, 03 and 06 give a hovered stamp (`rotate(3deg) scale(1.06)`).
 * `tokens.test.ts` checks that the READMEs and the boards still say so.
 */
export const STAMP = {
  border: "3px",
  tilt: "-4deg",
  dueTilt: "-5deg",
  wobble: "0.2s",
  swing: "3deg",
  swingScale: "1.06",
} as const;

/**
 * The large stub's day ticks: board 03 draws them in a 312-wide `viewBox`
 * at `max-width: 312px`. `tokens.test.ts` checks that the board still does.
 */
export const STUB = {
  ticksWidth: "312px",
} as const;

/**
 * A verdict mark: `design/system/components/VerdictMark/README.md`,
 * "直径 26px，间隔 8px，桌面每行 14 个，手机每行 10 个" (26px across, 8px
 * apart, 14 to a row on desktop and 10 on phones). The gap is `space-2`;
 * the counts are the grid's columns in `VerdictMark.css`.
 * `tokens.test.ts` checks that the README still says so.
 */
export const MARK = {
  size: "26px",
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
 * The front page's three tiers of headlines (#119,
 * `design/system/components/Headline/README.md`). A headline's size is
 * `base + height ÷ 200 × span`: the README's table, desktop and phone. On
 * desktop, base + span is the size of the tier's type style in
 * `tokens.json` (`headline-lead` 96, `headline-2` 46, `headline-3` 30).
 * A wave going out is set at the README's weight 500 ("字重 500").
 * The kicker's and wave numbers' phone sizes, the numbers' desktop sizes
 * below the lead and the phone number column are the boards' (01
 * `Front2.dc.html`, 02 `FrontMobile.dc.html`): the type scale has only the
 * lead's number (`wave-number`) and kicker. The trend line draws itself in
 * the design system README's "1.8 秒，一次" (1.8 s, once). `tokens.test.ts`
 * checks that the README and the boards still say so.
 */
export const HEADLINE = {
  leadBase: "44px",
  leadSpan: "52px",
  leadPhoneBase: "30px",
  leadPhoneSpan: "18px",
  secondBase: "22px",
  secondSpan: "24px",
  secondPhoneBase: "19px",
  secondPhoneSpan: "8px",
  thirdBase: "17px",
  thirdSpan: "13px",
  thirdPhoneBase: "16px",
  thirdPhoneSpan: "4px",
  fadingWeight: "500",
  leadPhoneKicker: "19px",
  leadPhoneNumber: "104px",
  secondNumber: "40px",
  secondPhoneNumber: "34px",
  thirdNumber: "28px",
  thirdPhoneNumber: "26px",
  phoneNumberColumn: "62px",
  trendDraw: "1.8s",
} as const;

/**
 * The index beside the headlines (#120,
 * `design/system/components/IndexRow/README.md`): "短标题 600 字重" (the
 * short title at weight 600), "2px `hair` 点线" (a 2px dotted leader) and
 * "浪高数字右对齐，占固定 38px" (the number right-aligned in a fixed 38px
 * column). The number's size (22px) and the rank's column (24px on
 * desktop, 22px on phones) are the boards' (01 `Front2.dc.html`, 02
 * `FrontMobile.dc.html`): the type scale has no style for them.
 * `tokens.test.ts` checks that the README and the boards still say so.
 */
export const INDEX = {
  titleWeight: "600",
  leader: "2px",
  numberColumn: "38px",
  numberSize: "22px",
  rankColumn: "24px",
  phoneRankColumn: "22px",
} as const;

/**
 * The rows the index shows on phones before its "Show all" button: the
 * IndexRow README, "手机只显示前 8 行" (phones show the first 8 rows).
 * `tokens.test.ts` checks that the README still says so.
 */
export const INDEX_PHONE_ROWS = 8;

/**
 * Below this width a band is one column: the rail becomes a heading above
 * the content. The design system names no breakpoint; this is the agent's
 * choice (#106): the narrowest width where the rail at its full `rail` width,
 * the `space-8` gap and a content column of about 480px still fit.
 */
export const TWO_COLUMNS_FROM = "960px";
