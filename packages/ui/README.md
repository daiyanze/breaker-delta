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
`LanguageMenu`, `Masthead`, `TideTable` and `SourceTile` (with its island), `primitives` `Button`,
`Filters`, `SearchEntry` and the `ThemeSwitch` island; `catalog` (#258)
lists them. A file directly under `src/` is
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
- Drop-down menus (`runtime/menu.ts`, #112): a `<details>` with
  `MENU_ATTRIBUTE` (`data-menu`) opens without JavaScript; the loader,
  which every page links, closes every open one on Esc (the focus goes back
  to the button of the one that held it) and one a click lands outside.
  `menu.ts` is bundled into the loader, so no island may import it.
- The focus ring (`styles/base.css`, #112): one `:focus-visible` outline
  for every control, `--focus-width` of `blue`, `--focus-offset` clear of
  its edge. A component does not style its own.
- `states(Component, { name: props })` lists a component's states for the
  catalog; the props are checked against the component's.
- `Band` (`patterns/Band`): a section with its name in the rail. Classes
  `.Band` and `.Band-rail`, `.Band-name`, `.Band-note`, `.Band-body`; the
  heading's id is `band-<id>`. With `aside` it is the front page's band
  (`data-variant="front"`, #120): the content left, the aside (`.Band-aside`,
  the index) in the right rail, the name read out but not shown.
  `highlight` puts the name on `sun` (`.Band-mark`); `link` ends the band
  with one link (`.Band-link`, the section `data-link`), under the note on
  desktop and after the content on phones (#123).
- `EchoStack` (`patterns/EchoStack`, boards 01 to 03, #114): the stack of
  sheets beside a wave-height number, an SVG of `echoStackLayers(height)`
  sheets (height ÷ 200 × 12, 3 to 15) that drop in on a CSS loop when
  motion is allowed. It takes the height and a finished `label` that names
  the number of sheets. Classes `.EchoStack`, `-sheet`, `-blue`, `-sky`,
  `-top`, `-base`.
- `Headline` (`patterns/Headline`, boards 01 and 02, #119): the front
  page's three tiers of headlines, the lead (red kicker, headline, echo
  stack, height, a trend line that draws itself once) and ranks 2 and 3,
  then 4 to 6, in newspaper columns. A headline's size is `base + height ÷
  200 × span` per tier (`HEADLINE` in the supplement), set by its CSS from
  the title's three-digit `data-height`, so no style attribute. It takes
  finished text. Classes `.Headline`, `-lead`, `-story`, `-second`,
  `-third`, `-columns`, `-title`, `-fading`, `-link`, `-number`, `-new`,
  `-kicker`, `-figures`, `-trend`, `-chart`, `-note`, `-meta`, `-key`.
- `Index` (`patterns/Index`, an island, boards 01 and 02, #120) and
  `IndexRow` (`patterns/IndexRow`): the whole ranking beside the headlines,
  one row per wave (rank, short title, dotted leader, change, height), the
  row a link. Desktop shows every row and fills the front band's right
  rail; phones show the first `INDEX_PHONE_ROWS` (8) and a button that
  shows the rest, the one thing the island does. A wave formed today has a
  red number and change. Values the type scale lacks are `INDEX` in the
  supplement (`--index-*`). Classes `.Index`, `-head`, `-name`, `-order`,
  `-list`, `-open`, `-item`, `-note`, `-more`; `.IndexRow`, `-rank`,
  `-title`, `-leader`, `-change`, `-number`, `-new`.
- `LanguageMenu` (`patterns/LanguageMenu`, boards 01 and 02, #107): links to
  the same page in each language inside a `<details>`, so it opens without
  JavaScript; the current one has `aria-current`. It takes finished text:
  the button's label and each language's own name. On phones the button is
  the globe alone. A drop-down menu (`data-menu`): Esc closes it. `open` starts it open, for the catalog's `open` and
  `long` states; pages leave it out. Classes `.LanguageMenu`, `-details`,
  `-button`, `-icon`, `-current`, `-chevron`, `-list`, `-link`.
- `Masthead` (`patterns/Masthead`, boards 01 to 23, #110): the tools row
  (`tools`), the One ink mark and the wordmark as one link home (an `<h1>`
  with `heading`), the navigation with the `current` page marked, and the
  wave with its boat, moved by CSS alone and still under reduced motion. On
  phones the navigation is a `<details>` "Sections" disclosure. Its mark is
  `oneInkMark` of `apps/web/src/core/icon.ts` redrawn in Preact;
  `icon.test.ts` compares the shapes. `SPEC.md` in its folder.
- `Notice` (`primitives/Notice`, #122): the double-ruled notice, in its
  ebb form: a ripple whose amplitude follows the height (`RIPPLE`), the
  topic's name, an obituary-style sentence and the height now, all as
  finished text. `FadingNotices` (`patterns/FadingNotices`) is the front
  page's section of them in a `Band`, the rail's link and sunset passed
  through the band's `rail`; with no notice it is one sentence. Classes
  `.Notice`, `-ripple`, `-ripple-line`, `-title`, `-link`, `-text`,
  `-now`; `.FadingNotices`, `-rail`, `-flat`, `-sunset`, `-list`,
  `-item`, `-none`.
- `SourceTile` (`patterns/SourceTile`, boards 01 and 03, #113): the small
  square before a source's name, solid where the story started and
  outlined for a later source, with the site's favicon or a generic icon
  by kind (`kindOf(category)`). Plain markup without a favicon; with one,
  the `SourceTile` island. The generic icon shows by default; the favicon
  is hidden until the island marks it `data-loaded`, so a failed one, or
  any with JavaScript off, never draws a broken-image mark. Props `name`, `fill`, `kind`, `favicon`, `label` (finished text;
  without it the tile is `aria-hidden`), `size` (`small` in the
  classifieds). Classes `.SourceTile`, `-tile`, `-favicon`, `-glyph`,
  `-name`. `SPEC.md` in its folder.
- `Footer` (`patterns/Footer`, boards 01 and 02, #111): the footer every
  public page ends with: the subscribe form (left out with no `subscribe`
  prop, when the site sends no email), the links, the lighthouse drawing
  with its CSS-only motion (still under reduced motion), and the solid
  bar. On phones the drawing shows its right half. Classes `.Footer`,
  `-top`, `-form`, `-label`, `-field`, `-submit`, `-nav`, `-link`,
  `-long`, `-short`, `-art`, `-svg`, `-bar`, `-notes`, `-note`; in the
  drawing `-beam`, `-gulls`, `-solid`, `-edge`, `-tower`, `-red`, `-lamp`,
  `-drift` (`-drift-back`, `-drift-mid`, `-drift-front`), `-sky`, `-blue`,
  `-hatch`, `-boat`, `-mast`, `-jib`. Its timings, angles, beam opacity
  and link weight are `--footer-*` (`FOOTER` in `supplement.ts`); the
  field's id is unique per footer (`useId`). `SPEC.md` in its folder.
- `ThemeSwitch` (`primitives/ThemeSwitch`, an island): the masthead's
  square icon button (#105) that flips `<html data-theme>` and stores the
  choice. Props `toDark` and `toLight`, its name in each theme, as finished
  text (the site passes them from its string tables); the stylesheet shows
  the one that applies. `SPEC.md` in its folder.
- `Button` (`primitives/Button`, #112): the one button shape, a link with
  `href`, else a `<button>`. `variant` `default` (2px, 48px high), `solid`
  (the page's main action) or `secondary` (1px, 44px, small type), written
  as `data-variant`. An icon before the text is `.Button-icon`.
- `SearchEntry` (`primitives/SearchEntry`, #112): the secondary button with
  a magnifier that links to the search page; on phones the magnifier
  alone, its label read out. Classes `.SearchEntry`, `-label`.
- `Filters` (`primitives/Filters`, #112): a list page's filter items, each
  its own URL, the current one `aria-current="page"`, `ink` behind `paper`.
  Classes `.Filters`, `-item`.
- No control is shorter than `--control-min-height`: `controlHeights`
  (`styles/checks.ts`) reads the sheet for every link, button and menu
  button class the catalog renders (`apps/web/src/local/controls.test.tsx`).
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
  all (the phone gutter and section size, the control height, outline and
  padding, the focus ring, the icon size and stroke, the theme switch's
  icon size, the source tile's sizes, the echo stack's and the headlines'
  sizes, the footer's timings, angles, beam opacity and link weight, the
  index's values and phone row count, the tide table's height, surface and
  dot, the masthead's sizes and motion, the two-column breakpoint, the ebb
  notice's ripple rule and cycle, the illustration line width, the CJK
  weight in place of italic), each with the text it comes from. No other
  file holds a design value. All but the breakpoint, the index's row count
  and the ripple's numbers are also CSS variables: `--phone-*`,
  `--control-*`, `--focus-*`, `--icon-*`, `--source-tile-*`,
  `--echo-stack-*`, `--headline-*`, `--footer-*`, `--index-*`,
  `--tide-*`, `--masthead-*`, `--ripple-cycle`, `--illustration-stroke`, `--cjk-emphasis-weight`.
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
