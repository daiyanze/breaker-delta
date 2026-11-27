# VerdictMarks

## Purpose

Every registered wave as a `VerdictMark`, oldest first, with the legend
under them (#115): the track record's "Every wave so far". Not an island.

## Design

- `design/system/components/VerdictMark/README.md` (8px apart, 14 to a
  row on desktop and 10 on phones, a legend always under them), boards 06
  (`design/boards/Record2.dc.html`) and 07
  (`design/boards/Record2Done.dc.html`).
- Tokens: `space-2` between marks and in the legend, `space-4` for the
  legend's marks (board 07's 16px) and between its entries, `ink-2` and
  the `small` type style for its text; `MARK` from
  `src/tokens/supplement.ts`. Fourteen columns from `TWO_COLUMNS_FROM`.
- Ten 26px marks and their gaps need 332px, more than a 320px phone's
  content column, so a mark is 26px at most and shrinks with its column:
  the strip never scrolls sideways.

## Props

- `label`: the list's accessible name in the page's language ("41 waves,
  oldest first").
- `marks`: one per registered prediction, oldest first, each with its id
  and its kind.
- `legend`: every kind's name in the page's language; the legend's text
  and each mark's accessible name.

## States

- `default`: board 07's 41 waves.
- `none`: board 06, before any verdict: every mark empty.
- `long`: long legend names, which wrap.
- `zh`, `ja`: the legend in each language.

## Do not

- Leave the legend out or shorten it: every kind is listed, used or not.
- Show a hit rate beside it while no verdict is confirmed.
