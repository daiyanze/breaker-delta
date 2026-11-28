# TicketStub

## Purpose

A wave's 14-day test (#115), in a dashed frame with its `Stamp`. Small on
the front page (side by side, in `TicketStubs`), large on the topic page
with the day ticks and the test's hash. Not an island.

## Design

- `design/system/components/TicketStub/README.md`, boards 01
  (`design/boards/Front2.dc.html`, the small stubs) and 03
  (`design/boards/Topic2.dc.html`, the large one).
- Tokens: `ink`, `ink-2`, `blue`, `rule-dashed`, `radius-none`,
  `space-3` to `space-5`, the `kicker`, `section` and `small` type styles,
  `--phone-section-size`. From `src/tokens/supplement.ts`: `STUB` (the
  ticks' 312px width) and the stamp's `STAMP` wobble.
- The large stub's test is section size (32px on phones), not the board's
  34px, which no type style has; the small one's is `kicker` (22px).

## Props

- `size`: `small` (the default) or `large`.
- `stamp`: the `Stamp`'s props.
- `criterion`: the locked test, word for word, with its language.
- `topic`: the wave's name, its language and its page.
- `progress`: the day, the days, and their text ("Day 7 of 14"); a large
  stub draws a tick per day.
- `note`: a line after the progress (the lock note, or "Confirmed Nov 26").
- `hash`: the large stub's last line, the test's hash and registration.

All text is finished text in the page's language, except `criterion` and
`topic`, which carry their own.

## States

- `default`: the front page's small stub, due.
- `stamped`: a small stub with a confirmed verdict.
- `large`: the topic page's stub with ticks, lock note and hash.
- `long`: a long test and topic name.
- `zh`: a large stub in Chinese; `ja`: a small one in Japanese.

## Do not

- Edit or shorten `criterion`: it is the text locked when the wave formed
  (invariant 5).
- Show a hit rate next to it: none is shown before a verdict exists.
- Put the stubs of a page side by side by hand: use `TicketStubs`.
