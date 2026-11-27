# Footer

## Purpose

The footer every public page ends with (#111): the subscribe form and a
column of links, the lighthouse illustration, and a solid bar of short
notes. Used by the front page today; every public page takes it as it
lands. Not an island: the motion is CSS only.

## Design

- `design/boards/Front2.dc.html` and `design/boards/FrontMobile.dc.html`
  (boards 01 and 02): the footer markup and its keyframes (`drift`,
  `sweep`, `bob`).
- `design/system/README.md`: "图和动效清单" (页尾: three wave layers
  flowing against each other, a sailboat, the lighthouse, the beam 7
  seconds there and back), "颜色" (dark mode: `solid` deeper than the
  page, so waves and rock are silhouettes; the beam's 55% yellow is the
  one translucent colour).
- `design/system/components/Button/README.md`: the solid button, only for
  subscribing.
- Tokens: `rule-heavy` on top, `rule-dashed` (2px) for the field's and the
  button's outlines, `headline-3` for the form's heading line, `small` for
  the bar, `space-*`, `content`; colours `ink`, `paper`, `sun`, `solid`,
  `sky`, `blue`, `red`. From `src/tokens/supplement.ts`: `--control-height`,
  the phone gutter (`--page-gutter`) and `TWO_COLUMNS_FROM`.
- Where this differs from the boards: the heading line is `headline-3`
  (30px) at every width, as no token is board 01's 34px; the front wave's
  ripples are `sky` at full strength, not 40% (README: no translucent
  colour but the beam); the right beam is drawn on to x 1520, so its end
  never shows inside the view while it sweeps; board spacings with no token
  (40px, 10px, 6px, 22px) take the nearest `space-*`.

## Props

- `subscribe`: the form's `action`, its heading line `label`, the field's
  `placeholder` and the `button` text. Left out, no form: the site hides it
  when it sends no email (#81).
- `navLabel`: the links' landmark name ("Footer").
- `links`: each `href`, `label` and an optional `short` label for phones,
  where two links share a row.
- `art`: the illustration's accessible name.
- `notes`: the bar's lines; the first sits at the start, the rest at the
  end.

All text is finished text in the page's language.

## States

- `default`: the form, four links, one note.
- `no-form`: the site sends no email, so no form.
- `long`: a long heading line, button, link and two long notes, so the
  wrapping is in the shot.
- `zh`, `ja`: each language's own text.

The form's answers (sending, sent, wrong format, already subscribed, could
not save) are #145's.

## Do not

- Put the form in a page without a delivery method set up.
- Animate it from script, or keep it moving under reduced motion.
- Change the drawing's view box: the phone crop and the motion are shares
  of it (`Footer.css`).
- Add a second footer to a page: the form's field id is fixed.
