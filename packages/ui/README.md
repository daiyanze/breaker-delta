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

Only `tokens` exists today (#269); the others arrive with the plan in
`docs/plans/ui-architecture.yaml`. A file directly under `src/` is under no
rule and fails `check-deps`.

## `@bd/ui/tokens`

No JSX, no DOM and no runtime API: `tsconfig.tokens.json` has no DOM lib and
no Bun or Cloudflare types, so emails and share cards can import it.

- `tokens.gen.ts` is generated from `design/system/tokens.json`: the names as
  literal-union types, and the values. Do not edit it. After the design
  export changes, run `bun run --filter @bd/ui tokens` and commit the result;
  `scripts/generate-tokens.test.ts` fails while the two differ.
- `supplement.ts` holds the values the design states only in prose or not at
  all (the phone gutter and section size, the control height, the
  two-column breakpoint), each with the text it comes from. No other file
  holds a design value.
- `fonts.ts` lists the self-hosted font files (in `apps/web/public/fonts`).
- `index.ts` exports `colorOf`, `size`, `typeStyle`, `tokensCss`,
  `typeClassesCss`, `FONT_FILES` and `fontFaceCss`.

## Where a new thing goes

- **A token** goes into the design export (`design/system/tokens.json`),
  then the generator. A value the export does not carry yet goes into
  `supplement.ts` with its source.
- **A component** gets one folder in `primitives` or `patterns`: `Name.tsx`
  or `Name.island.tsx`, `Name.css`, `Name.states.tsx`, `SPEC.md`.
