# SearchEntry

## Purpose

The way into search (#112): the control in the tools above the masthead
(boards 01 and 02) that goes to the search page, where the search box is
(#142). A link, since search is a page of its own with the query in its
URL. Built on `Button` (`secondary`). Not an island.

## Design

- `design/boards/Front2.dc.html` (board 01): a 1px-outlined button, 44px
  high, a magnifier and "Search" in `small` type.
- `design/boards/FrontMobile.dc.html` (board 02): the magnifier alone, a
  44px square, named "Search".
- `design/system/components/Button/README.md`: the secondary button
  ("次要", "用于报头的搜索").
- `--control-min-height`, `--icon-size` and `--icon-stroke` from
  `src/tokens/supplement.ts`; the label shows from `TWO_COLUMNS_FROM`.

## Props

- `href`: the search page in the page's language.
- `label`: its name, finished, in the page's language ("Search"). On
  phones it is read out, not shown.

## States

- `default`: "Search".
- `long`: a long label, to show it wraps from the breakpoint and never
  widens the square on phones.
- `zh`, `ja`: each language's own label.

## Do not

- Put a search box here: the box is the search page's header (#142).
- Give it an `aria-label` over its text: the label is its name.
- Drop the label on phones: it is clipped, not removed.
