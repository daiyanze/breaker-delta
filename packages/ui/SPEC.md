# Component spec template

Every component folder under `src/primitives` and `src/patterns` holds a
`SPEC.md` written from this template, before the component is used in a
page (issue #259). `scripts/check-ui.ts` fails on a folder without one, on
a spec whose first line is not `# <Name>`, whose `##` sections are not the
five below in this order, or whose Design section cites no file under
`design/` that exists.

Copy the block below into `src/<layer>/<Name>/SPEC.md` and fill it in.

```md
# <Name>

## Purpose

What it is for, in one or two sentences, and where it is used (which
pages or which other components). If it is an island, say so and give its
client file (`/client/<Name>.island.js`).

## Design

- `design/system/components/<Name>/README.md` (or the board or the
  section of `design/system/README.md` it comes from), with the board
  numbers.
- The tokens it uses, and any value that comes from `src/tokens/supplement.ts`.

## Props

- `prop`: what it holds, and whose text it is (finished strings in the
  page's language; `@bd/ui` holds no string table).

## States

The states in `<Name>.states.tsx`, one line each: what it shows and why it
is a state (long text, each language whose layout differs, a state reached
only by a click given as a starting prop). Hover and focus are not states.

## Do not

- What a page or another component must not do with it: restyle it, pass
  raw HTML, nest it in a way the board does not show, add a variant here
  instead of in the design.
```
