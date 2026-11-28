# Index

## Purpose

The full ranking beside the headlines (#120): a heading, one `IndexRow`
per wave that is up, tallest first, and the key under them. On desktop it
shows every row and fills the height of the front band's right rail; on
phones it sits under the headlines and shows the first eight rows with a
button that shows the rest. An island for that button:
`/client/Index.island.js`. Used on the front page, in `Band`'s `aside`.

## Design

- `design/system/components/IndexRow/README.md` ("桌面显示全部并撑满右栏高度，
  手机只显示前 8 行加一个 Show all 按钮"); boards 01
  (`design/boards/Front2.dc.html`) and 02
  (`design/boards/FrontMobile.dc.html`); `design/system/README.md`,
  "版式": "头版区例外：内容在左，索引在右".
- The heading in the `section` style (`--phone-section-size` on phones)
  over a `rule-heavy` `ink` rule; "by height" and the key in `small`,
  `ink-2`; gaps `space-1` to `space-3`.
- The phone row count is `INDEX_PHONE_ROWS` in `src/tokens/supplement.ts`;
  `Index.css` hides the ninth row on, and `styles.test.ts` checks the two
  agree.
- The button is the Button README's default: a 2px `ink` outline
  (`rule-dashed`, the 2px line width), square, inverted on hover, at the
  control's height (`--control-height`).

## Props

- `id`: unique on the page; the heading is `<id>-name`, the list
  `<id>-list`.
- `name`, `order`: the heading and how the rows are ordered, finished text.
- `rows`: each row's `IndexRow` props, tallest first.
- `note`: the key under the rows, finished text; shown on desktop.
- `showAll`, `showFewer`: the phone button's text before and after it is
  pressed ("Show all 16 waves", "Show the top 8").
- `open`: start with every row showing on phones; for the catalog.

## States

- `default`: board 01's sixteen waves, two formed today.
- `open`: the same after the phone button is pressed.
- `quiet`: two waves, no button.
- `long`: titles long enough to wrap and a wide change.
- `zh`, `ja`: each language's own text.

## Do not

- Put it anywhere but the front band's `aside`: it fills that rail.
- Leave a wave out: the index is the whole ranking, the headlines' six
  included.
- Show the button on desktop, or hide rows there.
