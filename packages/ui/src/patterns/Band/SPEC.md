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
- `rail`: more of the rail under the note, optional: a link or the
  section's one illustration, as the fading notices' sunset (#122). The
  component that passes it styles it.
- `children`: the content column.
- `aside`: the front page's right rail (the index, #120). With it the
  band is the front band, the one exception of "版式" ("头版区例外：内容在左，
  索引在右"): the content on the left, the aside in a right rail at most
  `rail` wide and as tall as the content, not sticky, under the content on
  phones. The name is still the section's heading, read out but not shown,
  as boards 01 and 02 show none.

## States

- `default`: a name and a paragraph.
- `note`: with the note under the name.
- `long`: a long name and note, which set the rail's wrapping.
- `zh`, `ja`: each language's own text, since the rail's name sets its
  layout.
- `front`: with an `aside`, the front band's layout (#120).

## Do not

- Put a second heading level in the rail, or the content in the rail:
  `rail` holds what the board draws under the note, not the section's
  content.
- Change the columns or the breakpoint per page: the sheet's band rule
  (`bandColumns` in `src/styles/checks.ts`) holds them. `aside` is for the
  front page's band alone.
- Nest a band in a band.
