# IndexRow

## Purpose

One row of the index (#120): the rank, the short title, a dotted leader,
the change over 24 hours and the wave's height, the whole row a link to the
topic page. Server-rendered; the index island (`Index`) carries it to the
browser. Used by `Index` on the front page.

## Design

- `design/system/components/IndexRow/README.md`; boards 01
  (`design/boards/Front2.dc.html`) and 02
  (`design/boards/FrontMobile.dc.html`).
- The rank in the display face, italic, `ink-2`; the title at weight 600
  (`--index-title-weight`); the leader a 2px dotted `hair` line
  (`--index-leader`), lifted `space-1` above the baseline; the change in
  `small`, `ink-2`; the height in the display face at `wave-number`'s
  weight, right-aligned in a fixed 38px column (`--index-number-column`).
- A wave formed today: its number and its change in `red`.
- At least the control's height (`--control-min-height`, 44px); gaps
  `space-2`, padding `space-1`. Hovered, the row turns `blue`, as the
  boards' plain links do.
- From the boards, through the supplement: the number's size (22px) and
  the rank's column (24px, 22px on phones).

## Props

- `href`: the topic page.
- `rank`: the wave's place, from 1.
- `title`: the short title and its language.
- `height`: the wave's height; shown rounded.
- `formedToday`: the number and the change are red.
- `change`: finished text in the page's language: "new", "+63%", "−18%",
  or empty when the wave is level.

## States

- `default`: a rising wave, as on the README's preview.
- `new`: formed today, red number and "new".
- `down`: a wave going down.
- `level`: no change shown.
- `long`: a title long enough to wrap beside the leader.
- `zh`, `ja`: each language's own title, which sets where the leader
  starts.

## Do not

- Use it outside an index list: `Index` gives it its `<li>`.
- Pass a model-written URL or source name: `href` is the topic page.
- Colour a change red for any reason but a wave formed today.
