# Button

## Purpose

The site's one button shape (#112): an action on a page ("Read all 214
echoes", "Subscribe", "Copy link"). A link when it goes to another page
(`href`), a `<button>` otherwise. Other primitives build on it
(`SearchEntry`). Not an island.

## Design

- `design/system/components/Button/README.md` and `preview.html`: square
  (`radius-none`), an `ink` outline on a clear ground, inverted on hover.
  `default` is a 2px outline (`--control-border`) and 48px high
  (`--control-height`); `solid` is `ink` behind `paper`, only for a page's
  main action; `secondary` is a 1px outline (`rule-thin`), 44px high
  (`--control-min-height`), in `small` type.
- Text in the `button` type style; side padding `--control-padding` (the
  preview's and boards' 20px), `space-4` for `secondary`; an icon before
  the text is `.Button-icon` (`--icon-size`, `--icon-stroke`).
- `--control-*` from `src/tokens/supplement.ts`. The focus ring is the
  page's (`styles/base.css`, `--focus-*`).
- Hovered, `solid` inverts the other way (clear ground, `ink` text): the
  README gives it no hover, and every other button changes under the
  pointer (#112).

## Props

- `children`: the text, finished, in the page's language, saying what a
  click does; an icon may come first.
- `variant`: `default`, `solid` or `secondary`, written as `data-variant`
  (none for `default`) beside the class `Button`.
- `href`: makes it a link. Without it, `type` is `button` or `submit`
  (`button` by default).

## States

- `default`, `solid`, `secondary`: the README's three, with its sample text.
- `link`: with `href`, the same look as `default`.
- `long`: text that wraps inside the button at phone width.
- `zh`, `ja`: each language's own text.

## Do not

- Round its corners, or add a shape, a size or a colour here instead of in
  the design.
- Use `solid` for more than one action on a page.
- Write "More" or "Click here": the text says what happens.
- Make a link look like this unless it is an action.
