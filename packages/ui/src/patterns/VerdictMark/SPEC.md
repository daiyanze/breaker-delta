# VerdictMark

## Purpose

One registered wave's mark on the track record (#115): a small round mark
whose shape says where its test stands. Used in `VerdictMarks`, for each
wave and in the legend. Not an island.

## Design

- `design/system/components/VerdictMark/README.md`, boards 06
  (`design/boards/Record2.dc.html`) and 07
  (`design/boards/Record2Done.dc.html`), whose drawing it copies.
- Tokens: `ink`, `ink-2`, `red`, `sun`, `hair`. From
  `src/tokens/supplement.ts`: `MARK` (26px across).
- Board 07's legend draws "undecided" without the centre dot; the README
  and the board's own marks have it, so the mark has it everywhere.

## Props

- `mark`: `hit`, `partial`, `miss`, `undetermined`, `under_review` or
  `waiting` (the `marks` of `TrackRecord` in `@bd/contracts`).
- `label`: its name in the page's language; leave it out where text beside
  it names it, and it is hidden from screen readers.

## States

- `hit`, `partial`, `miss`, `undetermined`, `under_review`, `waiting`: one
  per kind. A mark shows no text, so there is no long or language state.

## Do not

- Tell two kinds apart by colour alone: each has its own shape, and a new
  kind needs a new shape in the design first.
- Draw it at another size by hand: `VerdictMarks` sets the legend's size.
