# Band

## Purpose

One section of a page (#106): a narrow left rail with the italic section
name and an optional note, and a right column with the content. Every page
is a stack of bands; it is the page-level layout, so a page lays out its
sections with `Band` and nothing of its own.

## Design

- `design/system/README.md`, section "版式": the rail at most `rail`
  (340px) wide, sticky while scrolling; block padding `space-8` (`space-7`
  on phones) and a `rule-thin` rule on top; on phones the rail becomes the
  section's heading above the content.
- `design/boards/Front2.dc.html` and `design/boards/FrontMobile.dc.html`
  (boards 01 and 02).
- The phone section size (`--phone-section-size`) and the two-column
  breakpoint (`TWO_COLUMNS_FROM`) come from `src/tokens/supplement.ts`.

## Props

- `id`: unique on the page; the name's element id is `band-<id>`, which
  labels the section.
- `name`: the section name, finished text in the page's language.
- `note`: one sentence under the name, optional.
- `highlight`: the name on a `sun` highlight (design system, colours:
  `sun` is "栏目名高亮", the section name marked "look here"; board 01's
  "Were we right?"). One band on a page at most.
- `link`: `{ href, text }`, one link to where the section goes on (board
  01's "Open the track record", #123). On desktop it sits under the note
  and the rail is not sticky, so the rail never slides over it; on phones
  it comes after the content (board 02). At least `control-min-height`
  tall.
- `children`: the content column.

## States

- `default`: a name and a paragraph.
- `note`: with the note under the name.
- `link`: a highlighted name, a note and a link, as the front page's
  "Were we right?" band.
- `long`: a long name and note, which set the rail's wrapping.
- `zh`, `ja`: each language's own text, since the rail's name sets its
  layout.

## Do not

- Put a second heading level in the rail, or the content in the rail.
- Change the columns or the breakpoint per page: the sheet's band rule
  (`bandColumns` in `src/styles/checks.ts`) holds them.
- Nest a band in a band.
