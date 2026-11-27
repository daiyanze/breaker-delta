# SourceTile

## Purpose

Shows where an echo or a source came from (#113): a small square with the
source site's favicon, or a generic icon by the kind of source, followed by
the source's name. Solid for the source where the story started, outlined
for one that picked it up later. Used by the topic page's clippings (#128)
and the front page's classifieds (#124), and wherever else a source is
named. Without a favicon it is plain markup. With one it is an island,
`/client/SourceTile.island.js`: the favicon is hidden until the island
sees it load, so the generic icon shows for a favicon that fails, and for
every favicon when JavaScript is off; no broken-image mark is ever drawn.
The markup is `tile.tsx`.

## Design

- `design/system/components/SourceTile/README.md`; boards 03
  (`design/boards/Topic2.dc.html`, the clippings) and 01
  (`design/boards/Front2.dc.html`, the classifieds).
- Tokens: `ink`, `paper`, `radius-tile`, `space-3` (`space-2` in the small
  tile), `icon-stroke`, `icon-size` (the small tile's icon).
- From `src/tokens/supplement.ts`: `SOURCE_TILE` (the 34px and 30px tiles,
  the 1.5px outline, the 20px icon).

## Props

- `name`: the source's name, finished text, shown after the tile. In the
  classifieds the page passes the name with its time ("Hacker News, 13:42").
- `fill`: `solid` (the story started here) or `outline` (picked it up
  later).
- `kind`: the generic icon: `forum`, `account`, `press`, `search`, `mail`,
  `code`. `kindOf(category)` maps a source group's category to one.
- `favicon`: the site's favicon URL. Leave it out for a group of sites (the
  README: a group shows the generic icon) or when there is none.
- `label`: what the fill means, read out for the tile, finished text in the
  page's language (`source.started` and `source.later` in the site's string
  tables). Left out, the tile is hidden from assistive technology.
- `size`: `regular` (34px, the default) or `small` (30px, the classifieds).

## States

- `solid`, `outline`: the two fills, with the forum and newspaper icons.
- `account`, `search`, `mail`, `code`: the other generic icons.
- `favicon`, `favicon-solid`: a favicon that loads, in each fill.
- `favicon-failed`: a favicon that does not load (a 404); the generic icon
  stays.
- `small`: the classifieds' tile, outlined in the text's colour, with no
  label.
- `long`: a name that wraps beside the tile.
- `zh`, `ja`: each language's own name, since the name sets the width.

## Do not

- Show the tile without the name, or restyle it per page: a page puts the
  component in its own row.
- Pass a favicon a model wrote: the URL comes from code (invariant 2).
- Use the fill for anything other than where the story started.
