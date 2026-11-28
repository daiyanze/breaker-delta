# Notice

## Purpose

A small double-ruled box, as a newspaper prints a notice. Today it has one
form, the ebb notice (#122): one wave that is going out, on the front
page's "Fading notices" section (`FadingNotices`). The correction form on
the topic page (a red title and what changed) comes with that page's issue.
Not an island.

## Design

- `design/system/components/Notice/README.md`: a 1px `ink` frame with a
  second 1px outline 3px outside it, square corners; a `blue` ripple on top
  whose amplitude is height ÷ 200 × 16, at least 2, drifting slowly; the
  title; one italic obituary-style sentence; a bold last line with the
  height now and its 24-hour fall.
- `design/boards/Front2.dc.html` and `design/boards/FrontMobile.dc.html`
  (boards 01 and 02): the ripple on a 240 × 40 board, 40px tall on desktop
  and 32px on phones. It is scaled by the box's height only (a viewBox one
  period wide, `meet`), so a wide notice gets a longer line, not a taller
  one, and the amplitude keeps following the height.
- `design/system/README.md`: "启事波纹振幅" and "图和动效清单" (9 seconds a
  cycle), from `RIPPLE` in `src/tokens/supplement.ts`; the line width
  ("线宽 2 到 3px") from `ILLUSTRATION`. The design system README's
  `display` line and board 35 (`Cjk2.dc.html`): no italic in Chinese and
  Japanese, weight 500 instead (`CJK.emphasisWeight`, `--cjk-emphasis-weight`).
- Tokens: `ink`, `blue`, `red` (the title's hover underline), `rule-thin`,
  `space-1` to `space-6`, type `clip-headline` for the title on desktop
  (its usage in `tokens.json` names notices, 启事: size, weight and line
  height), `kicker` for the sentence's line height and italic style,
  `body` and `small`.
- Board departures (the design system's tokens win): the title is 24px on
  desktop (`clip-headline`, board 01 has 22) and 17px on phones (`body`,
  board 02 has 18); the sentence is 17px on desktop (`body`, board 01 has
  18); the padding is 24px and 16px (`space-5`, `space-4`; the boards have
  20 and 14); the gap is 12px and 8px (`space-3`, `space-2`; the boards
  have 10).

## Props

- `title`: the topic's name and its language (`lang`), the page's
  language when a summary exists, else the source's own headline.
- `href`: the topic's page.
- `text`: the obituary-style sentence, finished, in the page's language.
- `now`: the bold last line, finished.
- `ripple`: the wave's height now, which sets the amplitude, and the
  ripple's accessible name.
- `lang`: the language of the notice's own text when it is not the
  page's. Only the catalog sets it (its `zh` and `ja` states); pages leave
  it out, since their text is in the page's language.

## States

- `default`: board 01's first notice.
- `low`: a height of 12, so the amplitude is the floor of 2.
- `tall`: a height of 196, near the scale's top: the tallest ripple.
- `long`: a long title that wraps over several lines.
- `zh`, `ja`: each language's own text, with `lang` set, so the sentence
  is upright at weight 500 on every catalog page.

## Do not

- Write the sentence in the component: the page fills the fixed pattern
  from data and its string tables.
- Use the obituary tone anywhere but the ebb notices (design system
  README, "讣告口吻只用在退潮启事上").
- Round the corners or drop the outline: the double rule is the notice.
- Animate the ripple for a reader who asks for reduced motion.
