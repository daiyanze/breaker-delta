# Stamp

## Purpose

Where a wave's 14-day test stands (#115): due, under review, or its
confirmed verdict. It sits on every `TicketStub` and, alone, at the left
of each row of the track record's ledger. Not an island.

## Design

- `design/system/components/TicketStub/README.md`: the six kinds, their
  frames and turns, and the loud due stamp of the front and topic pages.
  Boards 01, 03, 06 and 07 (`design/boards/Record2Done.dc.html` has all
  six).
- Tokens: `ink`, `ink-2`, `paper`, `red`, `blue`, `radius-stamp`,
  `rule-dashed`, `space-3`. From `src/tokens/supplement.ts`: `STAMP` (the
  3px frame, the -4° and -5° turns, and the 0.2 second wobble, swinging to
  the 3° and 1.06 that the boards give a hovered stamp).
- Where the board and the README disagree, the README wins: the board's
  front-page due stamp is the only one drawn, so the ledger's plain due
  stamp is the README's (2px dashed `ink`, upright).

## Props

- `kind`: `due`, `under_review`, `hit`, `partial`, `miss` or
  `undetermined`.
- `label`: the stamp's text in the page's language ("Due Nov 26", "Hit").
  The text names the kind, so no kind is told by colour alone.
- `loud`: a due stamp on the front and topic pages; ignored for any other
  kind.

## States

- `due`, `loud`, `under_review`, `hit`, `partial`, `miss`,
  `undetermined`: one per kind, and the loud due stamp.
- `long`: a long label, which wraps inside its frame rather than leave
  the page.
- `zh`, `ja`: labels in each language; the text sets the width.

## Do not

- Colour a stamp by hand or add a kind here: a new kind is a design
  change first.
- Put a stamp's meaning in its colour only: the label always names it.
- Animate it any other way: the wobble is the design's one motion for it,
  and reduced motion turns it off.
