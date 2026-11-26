# @bd/ui

The UI package of ADR 0020: everything the site, the desk, the emails and
the share cards are made from. `apps/web` holds routes, pages and strings,
and no component of its own. Nothing here imports an app.

## Layers and areas

Each layer imports only the layers before it. `scripts/check-deps.ts`
enforces it, by package name and by relative path, for code and for data
files (`.json`, `.css`) alike: a file in a folder the table does not list is
reported. `tokens` imports its own `.ts` files and `tokens.json`, and no
other data file, not even one in `src/tokens`.

| Folder (`src/`) | Holds | May import |
| --- | --- | --- |
| `tokens` | values and CSS variables from `design/system/tokens.json`, the font faces | `design/system/tokens.json` |
| `runtime` | `Document`, `renderDocument`, `island`, `states`, the loader | `tokens`, `preact`, `preact-render-to-string` |
| `primitives` | Button, Menu, Tabs, Notice, form fields, Icon | the two above, `preact` |
| `patterns` | Band, Masthead, Newsstand and the other Tide Paper parts | the three above, `preact`, `@bd/contracts` types |
| `styles` | `uiCss()`: the whole stylesheet as text | `tokens`, the components' `.css` |
| `catalog` | every component's states, for `/_catalog` | the layers, `preact` |
| `build` | `buildClient()`: the client files, bundled with Bun | everything above, `bun`, `node:` |

`tokens` (#269), `styles` and `build` (#270), `runtime` and `patterns`
(#271) exist today; `patterns` holds `Band`. The others arrive with the
plan in `docs/plans/ui-architecture.yaml`. A file directly under `src/` is
under no rule and fails `check-deps`.

## `@bd/ui/runtime` and `@bd/ui/patterns`

- Components are Preact, rendered on the server. Every `.tsx` file starts
  with `/** @jsxImportSource preact */` on its first line
  (`scripts/jsx-pragma.test.ts` fails otherwise): Bun reads JSX settings
  from the working directory's tsconfig, not the file's. This package's
  `tsconfig.json` extends the base (`jsx: react-jsx`); wrangler's bundler
  reads a file of that name.
- `Document` is the whole page: `<html lang>`, the font preloads, the
  stylesheet at `CLIENT.css`, the page's own `head`, then its children.
  `renderDocument` turns it into HTML with its doctype. It is the only
  place HTML text is made, so escaping is the renderer's: a page passes
  plain strings.
- `states(Component, { name: props })` lists a component's states for the
  catalog; the props are checked against the component's.
- `Band` (`patterns/Band`): a section with its name in the rail. Classes
  `.Band` and `.Band-rail`, `.Band-name`, `.Band-note`, `.Band-body`; the
  heading's id is `band-<id>`.
- `LanguageMenu` (`patterns/LanguageMenu`, boards 01 and 02, #107): links to
  the same page in each language inside a `<details>`, so it opens without
  JavaScript; the current one has `aria-current`. It takes finished text:
  the button's label and each language's own name. On phones the button is
  the globe alone. Classes `.LanguageMenu`, `-details`, `-button`, `-icon`,
  `-current`, `-chevron`, `-list`, `-link`.

## `@bd/ui/styles` and `@bd/ui/build`

- CSS is plain `.css` files, each written inside its cascade layer
  (`@layer base { … }`), with native nesting. Layers, first to last:
  `tokens, base, primitives, patterns`. Page defaults are
  `styles/base.css`; a component's styles are `Name.css` in its folder.
- `uiCss()` imports each file as text and joins them in layer order, after
  the font faces and `tokensCss()`. A new `.css` file goes into
  `CSS_FILES` in `styles/index.ts`; `styles.test.ts` fails until it does.
- Themed colours are one `light-dark()` variable each; the shadows keep
  three blocks. `<html data-theme="light|dark">` overrides the system.
- A value goes through a variable from the tokens layer, never a literal:
  `scripts/check-colors.ts` reports a colour literal anywhere under `src`
  outside `tokens`. The one literal allowed is the two-column breakpoint in
  a media query (`TWO_COLUMNS_FROM`).
- `styles/checks.ts` holds the design rules the tests run on the sheet:
  tabular figures, no type under 13px, fonts preloaded and never swapped
  late, the band's columns.
- `buildClient()` returns the files served under `/client/` (`ui.css`).
  `scripts/write-client.ts <dir>/client` writes them: `build:local` embeds
  `dist/client` in the executable, and wrangler's build command writes
  `apps/web/public/client` (git-ignored). Run from source, the local site
  builds them in memory at start.

## `@bd/ui/tokens`

No JSX, no DOM and no runtime API: `tsconfig.tokens.json` has no DOM lib and
no Bun or Cloudflare types, so emails and share cards can import it.

- `tokens.gen.ts` is generated from `design/system/tokens.json`: the names as
  literal-union types, and the values. Do not edit it. After the design
  export changes, run `bun run --filter @bd/ui tokens` and commit the result;
  `scripts/generate-tokens.test.ts` fails while the two differ.
- `supplement.ts` holds the values the design states only in prose or not at
  all (the phone gutter and section size, the control height, the icon
  size and stroke, the two-column breakpoint), each with the text it comes
  from. No other file holds a design value. All but the breakpoint are
  also CSS variables: `--phone-*`, `--control-*`, `--icon-*`.
- `fonts.ts` lists the self-hosted font files (in `apps/web/public/fonts`).
- `index.ts` exports `colorOf`, `size`, `typeStyle`, `tokensCss`,
  `typeClassesCss`, `FONT_FILES` and `fontFaceCss`.

## Where a new thing goes

- **A token** goes into the design export (`design/system/tokens.json`),
  then the generator. A value the export does not carry yet goes into
  `supplement.ts` with its source.
- **A component** gets one folder in `primitives` or `patterns`: `Name.tsx`
  or `Name.island.tsx`, `Name.css`, `Name.states.tsx`, `SPEC.md`.
