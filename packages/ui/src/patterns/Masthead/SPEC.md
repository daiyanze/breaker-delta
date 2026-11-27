# Masthead

## Purpose

The newspaper masthead every public page opens with (#110): a row of tools
(the language menu and the theme switch the page passes), the One ink round
mark and the wordmark as one link to the front page, the navigation with
the current page marked, and a wave line with a sailboat riding it. Not an
island: the wave and the boat move by CSS alone. The desk does not use it.

## Design

- `design/system/components/Masthead/README.md`: the mark left of the
  wordmark, 0.84 of its size, 0.14em apart; the navigation at the end,
  aligned with the wordmark's foot; the current item bold with a 4px `red`
  line under it; the 3.5px `ink` sine wave of 60px periods drifting 240px
  left in 30 seconds; the boat crossing a wave every 2.5 seconds, ±3.5px
  and ±5°; on phones a 34px mark in its simplest drawing, a 38px wordmark
  on one line and the navigation in a "Sections" disclosure; nothing moves
  under reduced motion.
- `design/boards/Front2.dc.html` and `design/boards/FrontMobile.dc.html`
  (boards 01 and 02; the other public boards to 23 repeat it): the tools
  row above, the wave's 44px band, the boat's drawing and its crossing time.
- `design/system/components/Icon/README.md`: the One ink mark, at the
  medium detail (the small one on phones). Its shapes are those of
  `apps/web/src/core/icon.ts`; `apps/web/src/core/icon.test.ts` compares
  them.
- Tokens: `masthead` (size, line, weight, tracking), `ink`, `paper`,
  `red`, `blue`, `tint`, `rule-heavy`, `rule-thin`, `rail`, `space-1` to
  `space-5`. The navigation's items have `space-3` each side where the
  boards draw 16px: with 16px the English navigation and the full-size
  wordmark do not fit on one 1280px line. Where they do not fit, the
  navigation goes to the line under the wordmark, still at the end. On a
  390px phone the 38px wordmark and the "Sections" button do not fit on one
  line either; the button goes to the line under it, at the end, and the
  wordmark keeps its size down to where it would not fit alone. From `src/tokens/supplement.ts`: `MASTHEAD` (`--masthead-*`),
  `--control-*`, `--icon-stroke` and the two-column breakpoint
  (`TWO_COLUMNS_FROM`), where the navigation unfolds.

## Props

- `home`: the front page in the page's language.
- `name`: the wordmark, "Breaker Delta" in every language.
- `links`: each section's `href`, its `label` in the page's language, and
  `current` on the page's own one.
- `navLabel`: the navigation's accessible name ("Main"), in the page's
  language.
- `sectionsLabel`: the phone disclosure's button ("Sections"), in the
  page's language.
- `heading`: the wordmark is the page's `<h1>`; the front page sets it,
  a page with a heading of its own leaves it out.
- `tools`: what goes in the row above the wordmark, at its end.
- `open`: starts the phone disclosure open. Only the catalog sets it.

## States

- `default`: English, the front page current.
- `current`: another item current, so the red line moves.
- `open`: the phone disclosure open, given as the starting prop since a
  click opens it.
- `tools`: the row above with the language menu and the theme switch.
- `long`: long labels, open, so the navigation's wrapping and the list's
  width are in the shots.
- `zh`, `ja`: board 35's navigation in each language.

## Do not

- Put two mastheads on one page: the mark's clip has one id.
- Translate the wordmark: the Chinese and Japanese names beside it belong
  to #147, not to a page.
- Move the wave or the boat with script, or keep them moving under reduced
  motion.
- Restyle it per page, or use it on the desk, which has its own top bar.
