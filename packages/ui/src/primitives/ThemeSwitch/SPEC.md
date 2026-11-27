# ThemeSwitch

## Purpose

The masthead's theme switch of boards 01 and 02 (#105). An island (ADR
0020, section 2): `/client/ThemeSwitch.island.js`.

- A click flips `<html data-theme>` between `light` and `dark` and stores
  the choice in `localStorage` under `THEME_KEY` (`@bd/ui/runtime`). The
  constant script in `Document` applies it before first paint on the next
  load, so the other theme never shows first. Storage that refuses (a
  private window) leaves the switch working for the page.
- Until it is clicked the page follows the system (`light-dark()` under
  `color-scheme`). There is no third "follow the system" state: the board
  has two.

## Design

- `design/system/components/Button/README.md`: the secondary button
  ("次要"), a 1px `ink` outline, no fill; on hover `ink` behind a `paper`
  icon.
- `design/boards/Front2.dc.html` and `design/boards/FrontMobile.dc.html`
  (boards 01 and 02): its place in the masthead.
- A square, the control's smallest height (`--control-min-height`, 44px)
  on each side, holding the board's half-filled circle
  (`--icon-theme-switch`, 20px); both from `src/tokens/supplement.ts`.

## Props

- `toDark` and `toLight`: the button's name in each theme as finished
  strings ("Switch to dark mode", "Switch to light mode", from the board).
  Both are in the markup; the stylesheet hides the one that does not apply
  by the rules that pick the theme, so the name is right before the island
  runs and the server and the browser render the same. The names are
  clipped to nothing: read out, not shown.

## States

- `default`: the English names.
- `long`: long names, to show they never widen the square.
- `zh`, `ja`: each language's names.

## Do not

- Add a third "system" choice, or a text label beside the icon: the board
  has neither.
- Style the focus ring here: it is the browser's own until the board's 3px
  ring has a token.
- Read or write the theme anywhere else: `THEME_KEY` and `Document`'s
  script are the one other place that knows it.
