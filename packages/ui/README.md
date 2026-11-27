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
(#271) and `primitives` (#272) exist today; `patterns` holds `Band`,
`primitives` the `ThemeSwitch` island; `catalog` (#258) lists them. A file directly under `src/` is
under no rule and fails `check-deps`.

## `@bd/ui/runtime` and `@bd/ui/patterns`

- Components are Preact, rendered on the server. Every `.tsx` file starts
  with `/** @jsxImportSource preact */` on its first line
  (`scripts/jsx-pragma.test.ts` fails otherwise): Bun reads JSX settings
  from the working directory's tsconfig, not the file's. This package's
  `tsconfig.json` extends the base (`jsx: react-jsx`); wrangler's bundler
  reads a file of that name.
- `Document` is the whole page: `<html lang>`, the constant theme script
  (`THEME_SCRIPT`: applies the theme stored under `THEME_KEY` before first
  paint, the one `dangerouslySetInnerHTML`), the font preloads, the
  stylesheet at `CLIENT.css`, the loader at `CLIENT.loader` as a module,
  the page's own `head`, then its children. `renderDocument` turns it into
  HTML with its doctype. It is the only place HTML text is made, so
  escaping is the renderer's: a page passes plain strings.
- Islands (ADR 0020, section 2): a component that runs in the browser
  lives in `<Name>.island.tsx` and default-exports
  `island("<Name>", Component)`; the name is the file name and the URL
  `/client/<Name>.island.js` (`build/build.test.ts` checks both). On the
  server it renders `<bd-island name props>` around the component, the
  props as JSON in an attribute. Props must be JSON all the way down
  (`Jsonable`): a function, a `Date`, a `Map`, `children` or `unknown` is
  a compile error (`patterns/island-props.test.ts`). An island imports
  `runtime/island.ts` and `runtime/theme.ts` directly, never the runtime's
  index, so the renderer stays out of its bundle.
- The loader (`runtime/loader.ts`, `/client/loader.js`) defines
  `<bd-island>`. It imports nothing up front: Preact and an island's
  module come by dynamic import, so a page without an island loads the
  loader alone.
- `states(Component, { name: props })` lists a component's states for the
  catalog; the props are checked against the component's.
- `Band` (`patterns/Band`): a section with its name in the rail. Classes
  `.Band` and `.Band-rail`, `.Band-name`, `.Band-note`, `.Band-body`; the
  heading's id is `band-<id>`.
- `LanguageMenu` (`patterns/LanguageMenu`, boards 01 and 02, #107): links to
  the same page in each language inside a `<details>`, so it opens without
  JavaScript; the current one has `aria-current`. It takes finished text:
  the button's label and each language's own name. On phones the button is
  the globe alone. `open` starts it open, for the catalog's `open` and
  `long` states; pages leave it out. Classes `.LanguageMenu`, `-details`,
  `-button`, `-icon`, `-current`, `-chevron`, `-list`, `-link`.
- `ThemeSwitch` (`primitives/ThemeSwitch`, an island): the masthead's
  square icon button (#105) that flips `<html data-theme>` and stores the
  choice. Props `toDark` and `toLight`, its name in each theme, as finished
  text (the site passes them from its string tables); the stylesheet shows
  the one that applies. `SPEC.md` in its folder.
- `Stamp`, `TicketStub`, `TicketStubs`, `VerdictMark`, `VerdictMarks`
  (`patterns`, boards 01, 03, 06 and 07, #115): how a 14-day test and its
  verdict are shown. A stamp's kind (`data-kind`) is told by its text and
  its frame, a mark's by its shape, never by colour alone; a hovered stamp
  or stub wobbles the stamp for 0.2 seconds, unless motion is reduced. The
  values the design gives only in prose are `STAMP`, `STUB` and `MARK` in
  `supplement.ts`. `SPEC.md` in each folder.

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
  outside `tokens`, and `scripts/check-ui.ts` a `px` or `rem` length or a
  font name (#259). The one literal allowed is the two-column breakpoint in
  a media query (`TWO_COLUMNS_FROM`).
- `styles/checks.ts` holds the design rules the tests run on the sheet:
  tabular figures, no type under 13px, fonts preloaded and never swapped
  late, the band's columns.
- `buildClient()` returns the files served under `/client/`: `ui.css`,
  `loader.js`, one `<Name>.island.js` per island and the shared
  `chunk-<hash>.js` files (Preact), bundled with `Bun.build` from
  the package folder (`packages/ui`), so the names do not depend on the working directory.
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
  size and stroke, the theme switch's icon size, the two-column
  breakpoint), each with the text it comes from. No other file holds a
  design value. All but the breakpoint are also CSS variables: `--phone-*`,
  `--control-*`, `--icon-*`.
- `contrast.test.ts` computes the WCAG 2.2 contrast of every text and
  background pair the design uses, in both themes: 4.5:1 for text, 3:1 for
  a control's outline. A new colour token fails it until it is placed.
- `fonts.ts` lists the self-hosted font files (in `apps/web/public/fonts`).
- `index.ts` exports `colorOf`, `size`, `typeStyle`, `tokensCss`,
  `typeClassesCss`, `FONT_FILES` and `fontFaceCss`.

## `@bd/ui/catalog`

- `CATALOG` lists every component with its states, from each folder's
  `<Name>.states.tsx`, primitives first. `catalog.test.tsx` finds the
  component folders under `primitives` and `patterns` and fails on a folder
  without a states file, a states file missing from the list, or a listed
  folder that is gone; it also renders every state on the server.
- A state is a set of props. Hover and focus are not states. A component
  whose layout depends on its text has a long-text state and a state per
  language with its own sample text (`Band`: `long`, `zh`, `ja`).
- Only the local site adapter imports it (`check-deps` keeps it out of
  `apps/web/src/cloudflare` and `src/core`): `/_catalog` in
  `apps/web/src/local/catalog.tsx` shows every state, one theme and one
  language per page. `bun run ui:screens` (`apps/web/scripts/screens.ts`)
  captures each state alone on a page (`&shot=`, so adding a state never
  moves another's shot), at 1440 and 390 wide, in both themes and every
  language, at rest, hovered and focused, and compares them with
  `apps/web/screenshots/<platform>`; `bun run ui:baseline` rewrites them.
  The committed baselines are Linux's, from the `screenshots` CI job.
- A shot's clip is the union of three things, rounded out to whole pixels:
  the state wrapper's box, the box of every descendant that is drawn
  (`checkVisibility()`), and the box of every pixel of the page that
  differs from the page's background by more than the comparison's noise
  level (8 in a channel). The page holds the state alone, so the last one
  takes in an open menu's list, focus rings, outlines, box shadows and
  pseudo-elements outside the element boxes. Not in a shot: paint within 8
  of the background's colour in every channel, which the comparison would
  count as noise anyway.

## Where a new thing goes

- **A token** goes into the design export (`design/system/tokens.json`),
  then the generator. A value the export does not carry yet goes into
  `supplement.ts` with its source.
- **A component** gets one folder in `primitives` or `patterns`: `Name.tsx`
  or `Name.island.tsx`, `Name.css`, `Name.states.tsx`, `SPEC.md`, and an
  entry in `CATALOG` (`catalog/index.ts`).
  `SPEC.md` follows the template in `packages/ui/SPEC.md`;
  `scripts/check-ui.ts` fails on a folder without the states file or the
  spec, and on a page in `apps/*` that styles itself (#259).
