# FadingNotices

## Purpose

The front page's "Fading notices" section (#122): the waves that are still
up but falling, one ebb `Notice` each, in a `Band` whose rail holds the
note, a link to the waves that went flat and a sunset. When no wave is
going out, the section is its name and one sentence. Not an island.

## Design

- `design/boards/Front2.dc.html` and `design/boards/FrontMobile.dc.html`
  (boards 01 and 02), section "Fading notices": the notices side by side
  and wrapping (at least 230px each on desktop, 150px on phones); in the
  rail, the note, the link, and the sunset at 240px on desktop, 96px beside
  the text on phones.
- `design/system/README.md`, "图和动效清单": "退潮启事 | 波纹缓慢流动；左栏有
  落日插画" (the ripple drifts; a sunset in the left rail); "插画风格": flat
  spot colour with `ink` outlines, 2 to 3px lines (`ILLUSTRATION` in
  `src/tokens/supplement.ts`), at most one illustration a section.
- `design/system/components/Notice/README.md` for each notice.
- Tokens: `sun`, `ink`, `blue`, `rail`, `space-2`, `space-3`, `space-5`,
  `space-8`, `--control-min-height`. The notices' widths are fractions of
  `rail` near the boards' 230px and 150px; the sunset's widths are sums of
  spacing tokens equal to the boards' 240px and 96px.
- Board departures: on phones the link stays in the rail, beside the
  sunset, rather than after the notices (board 02), since the rail and the
  content are two columns of the band; the sunset has one drawing at both
  widths (board 02 crops it to the sun).

## Props

- `name`, `note`: the section's name and the rail's note, finished text.
- `sunset`: the sunset's accessible name.
- `wentFlat`: the link's `href` and text; left out when no wave went flat.
- `notices`: one `Notice`'s props per wave going out.
- `none`: the one sentence the section is when `notices` is empty.

## States

- `default`: four notices, a row and a bit, with the link.
- `one`: a single notice and no link (the `quiet` fixture set).
- `none`: no wave going out: the name and one sentence.
- `long`: a long name, note, link and title.
- `zh`, `ja`: each language's own text.

## Do not

- Write a notice's sentence here: the page fills it from data and its
  string tables.
- Show the note, the link or the sunset when no wave is going out.
- Add a second illustration to the section.
