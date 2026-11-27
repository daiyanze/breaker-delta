# Headline

## Purpose

The front page's headlines in three tiers (#119): the lead story, then the
second tier (ranks 2 and 3) and the third (ranks 4 to 6) in newspaper
columns. A headline's size follows its wave's height. Server-rendered, not
an island; the trend line's motion is CSS alone. Used on the front page.

## Design

- `design/system/components/Headline/README.md`; boards 01
  (`design/boards/Front2.dc.html`) and 02
  (`design/boards/FrontMobile.dc.html`).
- Size: `base + height ÷ 200 × span`, per tier, desktop and phone, the
  README's table, from `HEADLINE` in `src/tokens/supplement.ts`. The height
  is clamped to 0 to 200: on desktop base + span is the tier's type style
  (`headline-lead` 96, whose usage says "上限 96px", `headline-2` 46,
  `headline-3` 30), so no headline grows past its style.
- Type styles `headline-lead`, `headline-2`, `headline-3`, `kicker`,
  `wave-number`, `small`; rules `rule-heavy` (second tier) and `rule-thin`
  (third tier); spacing `space-1` to `space-7`.
- Colours: the kicker and the lead's height `red` (`wave-number`: "头条…的浪高
  数字，用 red"); below the lead a number is `red` when its wave formed
  today, else `ink`; a wave going out is `ink-2` at weight 500
  (`--headline-fading-weight`), the others `ink` at the style's 800 or 900.
  Hovered, a red underline, no movement.
- The trend line: `blue` on a `tint` area over an `ink` baseline, drawn
  once in `--headline-trend-draw` (1.8 s, design system README "图和动效清单")
  when motion is allowed.
- From the boards, through the supplement: the phone kicker size, the
  wave numbers' sizes below the lead and on phones, and the phone number
  column.
- Where the boards and the design system differ, the design system wins
  (`design/README.md`): the trend line is `blue` (the colour table gives
  `blue` to "走势线"; the boards draw it `ink`), and a lead that is going out
  is `ink-2` at 500 like any other headline (the boards keep the lead at
  900).

## Props

- `lead`: the tallest wave: `href`, `title` (its text and language),
  `height`, `formedToday`, `fading`, and finished text in the page's
  language: `delta`, `meta`, `kicker`, `stackLabel` (the echo stack's
  label, naming its sheets), `trendLabel`; `trend` is its heights at the
  last few runs, oldest first.
- `second`, `third`: the stories of each tier, the same fields without the
  lead's. The third tier does not show `meta`; the second shows it on
  desktop only, as on the boards.
- `note`: the one-line key under the tiers, finished text.

## States

- `default`: board 01's front page, a lead that is rising, two new waves in
  the second tier, a wave going out in the third.
- `formed`: the tallest wave formed today (the other kicker, a trend of
  one run, a level line); no other tier.
- `fading`: the tallest wave going out, and one story under it.
- `tallest`: a lead taller than 200, at its tier's full size.
- `long`: headlines long enough to wrap in every tier.
- `zh`, `ja`: the same front page in Chinese and Japanese text. The CJK
  type rules (their own sizes) are #147's.

## Do not

- Set a headline's size in a page or with a `style` attribute: it comes
  from `data-height` and `Headline.css`.
- Pass a model-written URL or source name: `href` is the topic page, the
  title is the topic's headline.
- Show a seventh story here: from rank 7 on, waves are in the index (#120).
- Move or skew a headline on hover.
