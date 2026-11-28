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
 * The button's side padding the README does not state: the Button preview and every
 * board draw `.btn{… padding:0 20px …}` (#112). `tokens.test.ts` checks
 * that the README and the preview still say so.
 */
export const CONTROL = {
  minHeight: "44px",
  height: "48px",
  /** The default and solid button's outline, the same README: "2px `ink` 描边". */
  outline: "2px",
  padding: "20px",
} as const;

/**
 * The keyboard focus ring, the same on every control (#112): every board
 * draws `.tp :focus-visible{outline:3px solid var(--blue);outline-offset:3px}`.
 * `tokens.test.ts` checks that boards 01 and 02 still say so.
 */
export const FOCUS = {
  width: "3px",
  offset: "3px",
} as const;

/**
 * The footer's drawing and links (#111). `tokens.test.ts` checks each
 * against its text.
 *
 * From `design/system/README.md`:
 * - `beamOpacity`: "灯塔光束的 55% 黄色是唯一例外" (the beam's 55% yellow
 *   is the one translucent colour).
 * - `beamSweep`: "光束 7 秒一个来回" (the beam, 7 seconds there and back).
 *
 * Not in the README, from boards 01 and 02 as drawn (agent's choice, #111):
 * - `waveBack`, `waveMid`, `waveFront`: one drift period of each wave layer,
 *   `.w1{animation:drift 22s …}`, `.w2{… 13s …}`, `.w3{… 9s …}`.
 * - `beamFrom`, `beamTo`: `@keyframes sweep`, from -4deg to 6deg and back.
 * - `boatBob`, `boatRise`, `boatPitch`: `.boat{animation:bob 4s …}` and
 *   `@keyframes bob`, down 6px and back, pitching ±2deg. The 6px is in the
 *   drawing's units: a length in a transform of an SVG element is in its
 *   user units.
 * - `linkWeight`: `.tp .nav a{… font-weight:500}`, the footer's links.
 */
export const FOOTER = {
  beamOpacity: "0.55",
  beamSweep: "7s",
  waveBack: "22s",
  waveMid: "13s",
  waveFront: "9s",
  beamFrom: "-4deg",
  beamTo: "6deg",
  boatBob: "4s",
  boatRise: "6px",
  boatPitch: "2deg",
  linkWeight: "500",
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
 * The source tile (#113): `design/system/components/SourceTile/README.md`,
 * "尺寸 34px（分类广告里 30px），1.5px 描边" (34px, 30px in the classifieds,
 * a 1.5px outline). Its icon is 20 × 20 in the 34px tile on board 03
 * (`<svg width="20" height="20">`); in the 30px tile of board 01's
 * classifieds it is 18 × 18, the interface icon size (`ICON.size`).
 * `tokens.test.ts` checks that the README and both boards still say so.
 */
export const SOURCE_TILE = {
  size: "34px",
  smallSize: "30px",
  border: "1.5px",
  icon: "20px",
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

/**
 * The ebb notice's ripple: design system README, "数据驱动的规则",
 * "启事波纹振幅 | 浪高 ÷ 200 × 16，最小 2" (amplitude = height ÷ 200 × 16, at
 * least 2), and "图和动效清单", "退潮启事 | 波纹缓慢流动；左栏有落日插画 |
 * 9 秒一循环" (the ripple drifts slowly, one cycle in 9 seconds).
 * `tokens.test.ts` checks that the README still says so. The amplitude is in
 * the ripple's own drawing units, a 240 × 40 board as on boards 01 and 02.
 */
export const RIPPLE = {
  per: 200,
  scale: 16,
  min: 2,
  cycle: "9s",
} as const;

/**
 * Drawn lines in illustrations: design system README, "插画风格", "线宽 2 到
 * 3px" (a line of 2 to 3px). Board 01 draws the ebb notices' ripple and the
 * sunset at 2.5. `tokens.test.ts` checks that the README still says so and
 * that the value is in that range.
 */
export const ILLUSTRATION = {
  stroke: "2.5px",
} as const;

/**
 * Chinese and Japanese have no italic: design system README, `display`,
 * "英文用斜体的地方改用字重 500" (where English uses italic, weight 500
 * instead); board 35 says the same. `tokens.test.ts` checks that the README
 * still says so.
 */
export const CJK = {
  emphasisWeight: 500,
} as const;
