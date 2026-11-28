# Filters

## Purpose

The filter items under a list page's header (#112): Changes, Echoes,
Sources, the track record and search results. Each item is a URL of its
own, so a filtered list can be bookmarked and shared; the page header that
holds them is #133. Not an island.

## Design

- `design/system/components/PageHero/README.md` and `preview.html`
  ("筛选项"): square buttons with a 1px `ink` outline, 44px high; the
  selected one `ink` behind `paper`; each one its own URL; the row wraps.
- `design/boards/Changes2.dc.html` (board 11) and `design/boards/Search2.dc.html`
  (board 26): `<nav class="chips" aria-label="Filter">`, `small` type at the
  button weight, an 8px gap (`space-2`), 16px side padding (`space-4`).
- `--control-min-height` from `src/tokens/supplement.ts`.
- Under the pointer an item takes the `tint` ground (#112): the README gives
  no hover, and inverting it as buttons do would make it look selected.
- The selected item is `aria-current="page"` where the boards write
  `"true"`: it is the page being read.

## Props

- `label`: the row's accessible name, in the page's language ("Filter").
- `items`: each item's `href`, its finished `label` in the page's language
  ("New waves", "Echoes, 31"), and whether it is `current`.

## States

- `default`: board 11's eight items, the first selected; it wraps on phones.
- `counts`: board 26's items with counts, the third selected.
- `long`: long items, which wrap inside themselves at phone width.
- `zh`, `ja`: each language's own items.

## Do not

- Filter in place with script: each item is a link to its own URL.
- Mark more than one item current.
- Scroll the row sideways: it wraps.
