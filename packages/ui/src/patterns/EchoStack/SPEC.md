# EchoStack

## Purpose

The stack of thin sheets beside a wave-height number (#114): it shows how
tall the wave is as echoes stacked one on another. Server-rendered SVG with
a CSS animation, not an island. Used on the front page beside the tallest
wave's height, and on the topic page header (#125) once it exists.

## Design

- `design/system/components/EchoStack/README.md`; boards 01
  (`design/boards/Front2.dc.html`), 02 (`design/boards/FrontMobile.dc.html`)
  and 03 (`design/boards/Topic2.dc.html`). The sheet geometry is the
  boards', in their `viewBox="0 0 120 220"` units.
- Sheets: height ÷ 200 × 12, rounded, at least 3 (design system README,
  "数据驱动的规则"); at most 15, the most the boards' frame holds (the
  agent's choice, #114).
- Colours `blue` and `sky` by turns, `red` on top, the baseline `ink`.
- From `src/tokens/supplement.ts` (`ECHO_STACK`): the width on desktop
  (`--echo-stack-width`) and phones (`--echo-stack-phone-width`), the loop
  (`--echo-stack-loop`) and the delay between sheets (`--echo-stack-step`).
  The height follows from the `viewBox`.
- Boards 01 to 03 draw a curl on the top sheet; the README says nothing is
  drawn on top, and the README wins (`design/README.md`), so there is none.

## Props

- `height`: the wave's height as `@bd/core` computed it.
- `label`: what the stack shows, read out in place of the picture; finished
  text in the page's language naming the number of sheets, which the page
  gets from `echoStackLayers(height)`.

## States

- `default`: height 196, the boards' 12 sheets.
- `mid`: height 100, 6 sheets.
- `low`: height 12, the fewest, 3.
- `tallest`: height 420, capped at 15.

Its label is read out, not shown, so no language or long text changes the
layout and there is no `long`, `zh` or `ja` state. The animation runs only
when motion is allowed; the screenshots reduce motion, so they show the
whole stack.

## Do not

- Draw anything on top of the stack (no curl, no crest, no circle).
- Pass a label that does not say how many sheets are drawn.
- Size it per page: its width comes from the supplement variables.
- Make it an island: the motion is CSS alone.
