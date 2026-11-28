# TideTable

## Purpose

The front page's tide table (#121): a picture of the day, when waves
formed, hour by hour. A 24-hour chart of a sea surface that swells at each
wave's formation hour, and under it a list of the same waves, each a link
to its topic page. The chart is one image with a summary for a screen
reader; the list is the text it reads. Not an island: the one motion is
CSS. The page puts it in a `Band` named "Tide table".

## Design

- `design/boards/Front2.dc.html` and `design/boards/FrontMobile.dc.html`
  (boards 01 and 02), the "Tide table" band.
- `design/system/README.md`, "数据驱动的规则": each wave formed today adds
  a bell-shaped swell at its formation hour, and the sum is scaled to its
  highest point (`surface.ts`, with board 01's numbers). "图和动效清单":
  the surface rises from the waterline once, over 1.2 seconds; still with
  reduced motion. "版式": no horizontal scrollbar anywhere.
- `design/boards/Quiet2.dc.html` (board 19): the band is left out with
  fewer than two new waves. The page decides that, not this component.
- Colours `tint` (the sea), `blue` (the surface), `red` (a wave's dot and
  time), `ink`, `ink-2`, `paper`, `hair`. Type `kicker`, `body`, `small`,
  `label`, `clip-headline`. Lines `rule-thin`, `rule-dashed`. From
  `src/tokens/supplement.ts`: the chart's height, the surface's stroke and
  the dot's radius (`TIDE`, `--tide-*`).
- Where the boards and the design system differ: board 01 puts the chart
  in a box that scrolls sideways under 620px; the chart here fits any
  width instead, its sea stretched across and its type kept at size.

## Props

- `waves`: each wave formed today, in any order: its topic page's `href`,
  the `hour` of the day it formed (0 to 24, in the site's time zone) and
  the same as `at` (`HH:MM`), its `title` and the title's `lang`, and its
  `height` now, from `@bd/core`.
- `now`: the edition's hour of the day; the surface ends there.
- `summary`: the chart's one-line summary, in the page's language.
- `nowLabel`, `laterLabel`: the labels over `now` and over the rest of the
  day, in the page's language.
- `highWaterLabel`: high water's label, given its time (`HH:MM`).

## States

- `default`: five waves, 08:00 to 14:00, at 14:00 (board 01).
- `two`: the fewest the page shows, two waves at 09:00.
- `late`: at 23:00, too late in the day for "still to come".
- `long`: titles that wrap in the list.
- `zh`, `ja`: titles and labels in each language; CJK labels lose the
  italic (board 35).

## Do not

- Pass a wave the page would not show (one not formed today), or decide
  here whether the band appears: the page leaves it out under two waves.
- Compute a height, a rank or whether a topic is a wave: they come from
  `@bd/core` through the read contracts (invariant 1).
- Put the chart in a box that scrolls sideways, or scale it so its type
  falls under 13px.
- Make the chart's dots or labels the only way to reach a wave: the list
  holds every one.
