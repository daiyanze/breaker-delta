# LanguageMenu

## Purpose

The masthead's language menu (#107): links to the same page in each
language, not an in-page switch. A `<details>` disclosure, so it opens
without JavaScript; it is not an island. A drop-down menu (#112,
`MENU_ATTRIBUTE` from `src/runtime/menu.ts`): once the loader runs, Esc
closes it and gives the focus back to its button, and a click outside
closes it.

## Design

- `design/boards/Front2.dc.html` and `design/boards/FrontMobile.dc.html`
  (boards 01 and 02): a thin-ruled button that opens a list of links, the
  current language marked with a red bar.
- `design/system/README.md`, section "版式": what does not fit goes into a
  drop-down (navigation, language).
- On phones the button is the globe alone, a square control
  (`--control-min-height`); from `TWO_COLUMNS_FROM` it also names the
  language. Both from `src/tokens/supplement.ts`. The list is half the
  rail wide at least (board 01's 170px).

## Props

- `label`: the button's accessible name in the page's language
  ("Language: English").
- `links`: each language's `href`, BCP 47 `lang`, its own `name` for
  itself (English, 中文, 日本語) and whether it is `current`.
- `open`: starts open. Only the catalog sets it; pages leave it out.

## States

- `default`: closed, English.
- `open`: the list shown, given as the starting prop since a click opens it.
- `long`: long names, open, so the list's width is in the shot.
- `zh`, `ja`: labelled in each language.

## Do not

- Translate a language's name into the page's language: each name is the
  language's own.
- Switch the language in place with script: each link is the page itself
  in that language.
- Let the list reach past the page's edge: it aligns to the button's end.
