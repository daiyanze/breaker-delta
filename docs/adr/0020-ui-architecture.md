# 0020 UI architecture: Preact on the server, islands, one UI package

Date: 2026-11-26. Status: proposed; the owner accepts it by merging it.
Builds on 0015 and 0018; answers the "choose" half of #56.

## Goal

The owner's words: settle the overall UI solution. It covers the public
site, the desk, the emails, the share cards, the component catalog (#258)
and the UI guardrails (#259).

Done means: this record is accepted, and the issues in
`docs/plans/ui-architecture.yaml` exist. Nothing is built by this record.

Out of scope: building any page or component; the query layer (#57); the
content of the string tables; the mail transport (0012).

## Who decided what

Marked per lesson L16.

| Value | Decided by |
| --- | --- |
| One record covers site, desk, emails, share cards, catalog, guardrails | owner, 2026-11-26 |
| The site's renderer is Preact | owner, 2026-11-26 |
| Public pages do not have to work with JavaScript off | owner, 2026-11-26 |
| Only the latest browser versions are supported | owner, 2026-11-26 |
| No third-party component library; Tide Paper tokens | owner, ADR 0015 |
| Emails are written with React Email, sent by `apps/pipeline` | owner, ADR 0012 |
| Whether React community libraries stay usable | the owner asked this on 2026-11-26 and chose Preact after the answer; no library was approved. Section 2 states what follows from it, as the agent's proposal |
| Everything else in "Decision" below | agent's proposal; the owner accepts it by merging this record |

## Constraints

| # | Constraint | Source |
| --- | --- | --- |
| C1 | The site runs on Bun's own server in one `bun build --compile` executable; no Node, wrangler or workerd locally; the core uses ports and standard Web APIs | ADR 0018 |
| C2 | The same core runs as a Cloudflare Worker | ADR 0018 |
| C3 | Tide Paper only; values come from `design/system/tokens.json` | ADR 0015, `design/README.md` |
| C4 | Interactive parts are client components; pages are server-rendered | ADR 0015 |
| C5 | `apps/web` only reads; every source file is under a `check-deps` rule | `AGENTS.md` |
| C6 | Fetched text is escaped before rendering | review checklist 6 |
| C7 | Emails: React Email, rendered by `apps/pipeline`, 600px, light only | ADR 0012, #143 |
| C8 | Share cards are drawn by `apps/pipeline` on first request | ADR 0009, #129 |
| C9 | One page per language; strings in tables; the desk switches in place | #107, `design/system/README.md` |
| C10 | The theme follows the system, remembers a choice, never flashes | #105 |
| C11 | Nothing needs Node | ADR 0018, amendment #13 |
| C12 | `design/` is an export, replaced wholesale when the design changes | `design/README.md` |

## Probes

Run on 2026-11-26 with Bun 1.4.2 on macOS arm64, in a scratch folder
outside the repository.

| Probe | Result |
| --- | --- |
| Render one page (a band, a 40-row list) with Preact 11.2.0, Hono JSX 4.13.22 and React 19.3.1: in Bun, in a compiled executable, and in workerd (Miniflare 5, no `nodejs_compat`) | all three work in all three places |
| Client bundle for one small island, minified and gzipped | React 65.1 kB, Hono JSX 6.8 kB, Preact 5.6 kB |
| Server render time for that page | React 150 µs, Hono JSX 55 µs, Preact 51 µs, template strings 19 µs |
| Radix Tabs and React Aria components through an alias of `react` | `preact/compat`: server output matches React's, client bundles (48 kB gzip; not run in a browser). Hono JSX: the server build fails (`flushSync` is missing) |
| The island mechanism below: `Bun.build` with `splitting`, files embedded with `bun build --compile --asset`, one custom-element loader | three islands hydrated and answered clicks in a real browser, served by the compiled executable |
| `light-dark()` under `<html data-theme>` in that page | the dark value applied after the switch |
| vinext 1.4.6, Node target, started under Bun | renders, but the production server is `node:http`, loads the build from disk at run time, and a minimal page ships 139 kB gzip of JavaScript |
| React Email (`@react-email/components` 1.0.12, `@react-email/render` 2.3.1) | renders in Bun and in workerd; the Worker bundle with it is about 219 kB gzip |
| `document.title` in server code, tsconfig without the DOM lib | type-checks once Preact is imported: types do not keep browser globals out of server components |
| Front-page data of the `busy` fixture as JSON | 17.3 kB, 4.4 kB gzip |
| A `.css` file imported as text (`with { type: "text" }`) | a string in Bun and in the compiled executable: the stylesheet needs no build |
| Island props as an attribute, with `</script>`, quotes, `&` and `<` in the text | the renderer escapes them and the JSON reads back equal |
| The client build run in memory when the server starts | 5 files in 11 ms; skipped when files are embedded |
| A `.tsx` file starting with `/** @jsxImportSource preact */`, with no tsconfig in reach | runs under `bun`, `bun test` and from another working directory |

Facts read from primary sources the same day: `light-dark()`, `@layer`,
nesting, container queries and `:has()` are Baseline Widely available;
`@scope`, Popover, invoker commands, `@starting-style` and same-document
view transitions are Newly available; anchor positioning's core is in all
three engines since 2026-01; cross-document view transitions, `if()`,
`@function`, customizable `<select>` and speculation rules still miss an
engine (webstatus.dev). Astro has no official Bun adapter. Playwright 1.65
runs on Bun as an opt-in (`bunx --bun playwright test`). Gmail strips CSS
custom properties and `@font-face` (caniemail.com).

## Use

A page, in `apps/web`:

```tsx
export async function frontPage(ctx: RouteContext) {
  const meta = await ctx.queries.siteMeta();
  const edition = await ctx.queries.edition();
  const s = strings(ctx.lang);
  return {
    document: (
      <Document lang={ctx.lang} title={meta.siteName}>
        <Band id="newsstand" name={s.newsstand}>
          <Newsstand papers={papers(edition)} selected={slot} nextRunAt={meta.nextRunAt} labels={s.newsstandLabels} />
        </Band>
        <Band id="front" name={s.frontPage}>
          <Button href="/echoes">{s.readAll(214)}</Button>
        </Band>
      </Document>
    ),
  };
}
```

An island, in `packages/ui`:

```tsx
// patterns/Newsstand/Newsstand.island.tsx
export default island("Newsstand", function Newsstand(props: NewsstandProps) {
  const [open, setOpen] = useState(false);
  return <nav class="Newsstand">…</nav>;
});
```

A component's states for the catalog, and a value in an email:

```tsx
// primitives/Button/Button.states.tsx
export default states(Button, {
  default: { children: "Read all 214 echoes" },
  solid: { variant: "solid", children: "Subscribe" },
});

// packages/mail/src/Confirm.tsx
<Text style={{ color: colorOf("ink", "light"), fontFamily: typeStyle("body").family }}>{data.strings.confirm}</Text>
```

## Shapes considered

Both were sketched as code against the real callers, on local branches that
are not pushed (`sketch/ui-architecture-a`, `sketch/ui-architecture-b`),
and both type-check. Sketch A was revised after the first challenge round
only: the JSX pragma, `RouteResult` and the `catalog` area came later and
are in this record, not in the sketch.

**A. Server-rendered Preact with named islands (chosen).** The server owns
the page. A component that needs the browser is wrapped with `island()`;
only those ship JavaScript.

**B. Whole-page hydration.** A page is `<name>.load.ts` (server) and
`<name>.view.tsx` (both sides); the browser hydrates the whole tree from the
data embedded as JSON. It lost because:

- every page ships all of its components and its data a second time
  (4.4 kB gzip for the busy front page), where A ships Preact and the
  islands the page uses;
- page state gets three holders (the URL, the server render, client state);
- any import from a view reaches the browser bundle, so a server module can
  leak into it; in A only `*.island.tsx` graphs are bundled;
- a server/browser difference (time zone, number format) is a hydration
  mismatch anywhere on the page, not inside one island;
- its one advantage, changing the page without a load, is not asked for:
  the selected edition has its own URL (#116).

**C. Template strings and hand-written custom elements** (today's
`layout.ts`, extended). Not sketched. Smallest client, but escaping stays a
manual call at every interpolation (C6), props are untyped, and it has no
path to a React library, which the owner asked about (see "Who decided
what").

Renderers: React costs 65 kB gzip on every page with an island. Hono JSX is
as small as Preact but cannot run React libraries. vinext fails C1. Astro
has no supported route to C1.

What the type check showed while sketching:

- A function, a `Date`, a `Map` or a callback as an island prop, at any
  depth, is a compile error; the read-contract shapes (`RankRow`,
  `SiteMeta`, `Edition`) and props written as interfaces are accepted.
- `states(Component, {...})` inferred the props from the states and
  rejected `variant: "solid"`; the states parameter is `NoInfer<P>`.
- Browser globals type-check in server code (see Probes), so that rule
  needs a check, not types.

## Decision

### 1. Renderer and routes

Preact 11 with `preact-render-to-string`. No framework and no Vite. The
site's routes are a table of `URLPattern`s in `apps/web/src/core`; a route
reads through the read contracts and returns a document or a `Response`.
HTML text is produced in one place, `renderDocument`, so escaping is the
renderer's, not the caller's.

```ts
// apps/web/src/core/routes.ts
export interface RouteContext {
  request: Request;
  url: URL;
  params: Readonly<Record<string, string | undefined>>;
  lang: Language;
  queries: ReadQueries;
}
/** A document with its status and headers (a 404 page, cache tags), or any other Response. */
export type RouteResult =
  | Response
  | { document: VNode; status?: number; headers?: Readonly<Record<string, string>> };
export interface Route {
  pattern: URLPattern;
  handle(ctx: RouteContext): Promise<RouteResult>;
}
```

`renderDocument` is for HTML. Feeds and the sitemap (#67) are XML and are
not written with it.

### 2. Islands

```ts
// @bd/ui/runtime
/** `T` itself when it is JSON all the way down, `never` where it is not. */
export type Jsonable<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends (...args: never[]) => unknown
    ? never
    : T extends readonly (infer U)[]
      ? readonly Jsonable<U>[]
      : T extends object
        ? { readonly [K in keyof T]: Jsonable<T[K]> }
        : never;

export interface Island<P> {
  (props: P): JSX.Element;
  islandName: string;
  component: ComponentType<P>;
}
export function island<P extends object>(
  name: string,
  component: ComponentType<P> & (P extends Jsonable<P> ? unknown : "island props must be JSON"),
): Island<P>;
```

- An island lives in `<Name>.island.tsx` and default-exports `island(...)`.
  The name is the file name and the URL: `/client/<Name>.island.js`.
- On the server it renders `<bd-island name="…" props="…">` around the
  component's HTML. The props are JSON in an attribute, so the renderer
  escapes them like any other text (C6). `dangerouslySetInnerHTML` is used
  in one place only: the constant theme script in `Document`.
- In the browser one loader defines the `bd-island` element, imports the
  island's module and hydrates it. Shared code (Preact) is a shared chunk.
- A component that is not an island runs on the server only. An island also
  renders on the server, so browser globals appear only inside its handlers
  and effects.
- An island does not import another island, and imports `@bd/contracts`
  with `import type` only, so no schema code reaches the browser. Text
  reaches an island as finished strings, not as functions.
- An island is a leaf: it has no `children`, so it cannot wrap content the
  server rendered. `<bd-island>` is `display: contents`, so it does not
  change the layout around it; it cannot sit directly inside a table row.
- What the type does not catch: a prop typed `object`, `{}` or `any`
  accepts anything, as does a class instance that has only fields; `NaN`
  or an `undefined` inside an array reads back as `null`. A prop typed `unknown` is rejected even when the data is JSON
  (`DeskSettings.history[].changes[].from` is `z.unknown()`); such a value
  reaches an island as text the server has already formatted.
- ADR 0015 stands: no third-party component library, headless ones
  (Radix, React Aria) included, with or without `preact/compat`. They were
  used above only to probe compatibility. What Preact keeps possible is a
  React library that is not a component library (a hook, a data or
  drawing helper) inside one island through `preact/compat`. None is
  adopted here; each one is the owner's decision, asked before it is built,
  with its bundle size.

### 3. `packages/ui` (`@bd/ui`)

Four layers; each imports only the ones before it, and `check-deps`
enforces it.

| Layer | Holds | May import |
| --- | --- | --- |
| `tokens` | values and CSS variables from `tokens.json`, the font-face definitions | `design/system/tokens.json` |
| `runtime` | `Document`, `renderDocument`, `island`, `states`, the loader | `tokens`, `preact`, `preact-render-to-string` |
| `primitives` | Button, Menu, Tabs, Notice, form fields, Icon | the two above |
| `patterns` | Band, Masthead, Newsstand, TicketStub and the other Tide Paper parts, one per `design/system/components/<Name>` | the three above, `@bd/contracts` types |

Three more areas serve the layers and are imported by no component:

| Area | Holds | May import |
| --- | --- | --- |
| `styles` | `uiCss()`: the whole stylesheet as text | `tokens`, every component's `.css` |
| `catalog` | the list of every component's states, for `/_catalog` (#258) | every `*.states.tsx` |
| `build` | `buildClient()`: the loader and the island modules, bundled with Bun | everything above, `bun` |

One folder per component: `Name.tsx` or `Name.island.tsx`, `Name.css`,
`Name.states.tsx`, `SPEC.md`. Nothing in `@bd/ui` imports an app.
`apps/web` holds routes, pages and strings, and no component of its own.

Every `.tsx` file names its own JSX runtime on its first line:
`/** @jsxImportSource preact */` (in `packages/mail`, `react`). Bun's
runtime reads JSX settings from the tsconfig of the working directory, not
of the file, so a setting in a tsconfig alone breaks `bun test` and local
mode started from the repository root. `tsconfig.base.json` gets only
`jsx: react-jsx`, which `tsc` needs in every program that reaches a `.tsx`:
the web adapters and `apps/local` as well as the core. Wrangler's bundler
needs the same setting and looks for a file named `tsconfig.json` beside
the source, so every package that holds a `.tsx` has one extending the
base; without it the Worker builds and then fails with `React is not
defined`.

```ts
// @bd/ui/runtime
export const CLIENT = { css: "/client/ui.css", loader: "/client/loader.js", fonts: "/fonts" } as const;
export interface DocumentProps {
  lang: string;
  title: string;
  theme?: Theme;
  head?: ComponentChildren;
  children: ComponentChildren;
}
export function Document(props: DocumentProps): VNode;
export function renderDocument(document: VNode): string;
export function states<P>(component: ComponentType<P>, states: { readonly [name: string]: NoInfer<P> }): States<P>;
```

### 4. CSS

- Plain `.css` files, one per component, written inside its layer:
  `@layer tokens, base, primitives, patterns;`. Native nesting. The root
  class is the component's name (`.Band`), its parts `.Band-rail`; today's
  `.band` classes are renamed when the component moves.
- No build step for CSS. `uiCss()` in `@bd/ui/styles` imports each file as
  text and joins them in layer order; a test fails when a `.css` file under
  `src` is missing from its list. Every page links the result at
  `/client/ui.css`; styles are no longer inlined in each page.
- Themed colours are one declaration each with `light-dark()`;
  `color-scheme` follows the system and `<html data-theme>` overrides it.
  `light-dark()` takes colours only, so a themed token that is not a colour
  (the three shadows) keeps today's form: `:root`, the dark media query and
  `[data-theme="dark"]`.
- A small constant script in `<head>` applies a stored theme before first
  paint (C10).
- A width in a media or container query cannot be a variable. It is the one
  literal a component's CSS may hold, and only a value the tokens layer
  lists as a breakpoint.
- The `.type-<name>` classes stay generated by the tokens layer, as today.
- No Tailwind, no CSS-in-JS, no utility classes. `apps/*` tracks no `.css`
  file and writes no `style=` in a page. The one exception is
  `apps/web/src/core/icon.ts`: the SVG icons it draws carry their styles
  inside, because most are served as files of their own and cannot link
  `ui.css`. Moving it into `@bd/ui` belongs to the issue that builds the
  Icon primitive, not to this plan.

### 5. Tokens

- `design/system/tokens.json` stays the source, in the design tool's own
  format (C12). `@bd/ui/tokens` is its only reader, so a later change of
  format touches one module. The DTCG format (2025.10) is not adopted now:
  its tools need Node (C11), and the export is not ours to reshape.
- A generator writes `tokens.gen.ts` with literal-union types and the
  values; a test regenerates it and compares (L19).
- The layer has no JSX, no DOM and no runtime API, so emails and share
  cards can import it.
- Some values the components need are not in `tokens.json`: the design
  states them only in prose (a control's height in
  `components/Button/README.md`, the phone gutter and section size in token
  `usage` text) or not at all (the two-column breakpoint, the agent's
  choice in #106). They live in one file of this layer, `supplement.ts`,
  each with the design text it comes from, until the design export carries
  them. No other file holds a value.

```ts
// @bd/ui/tokens
export type Theme = "light" | "dark";
export type ColorToken = "paper" | "ink" | "ink-2" /* … generated */;
/** Not `color(`: `scripts/check-colors.ts` reads that as a CSS colour function. */
export function colorOf(name: ColorToken, theme: Theme): string;
export function size(name: SpaceToken | RadiusToken | RuleToken): string;
export function typeStyle(name: TypeStyle): TypeValues;
export function tokensCss(): string;
export const FONT_FILES: readonly FontFile[];
export function fontFaceCss(base: string): string;
```

### 6. Strings

Components take their text as props. String tables live in `apps/web`, one
per language; a missing key fails CI (#107). The desk's strings come from
`design/strings`. An email template takes its text in its data, like any
component; the tables for emails live with the caller, `apps/pipeline`.

### 7. Emails

A new package, `packages/mail` (`@bd/mail`): React and React Email, with
literal values from `@bd/ui/tokens` (light theme, inline styles; Gmail
strips variables). It exports one function per template:
`render<Name>(data): Promise<{ html: string; text: string }>`. Only
`apps/pipeline` imports it. React never reaches a browser, and emails are
not part of `/_catalog`: each template has its own render test.

### 8. Share cards

A card is an SVG built from the tokens' literal values by a function the
pipeline calls (0009). Which engine turns it into a PNG in both a compiled
Bun executable and a Worker is not known; a spike answers it before #129.

### 9. Desk

The same stack: server-rendered pages under `/admin`, islands where a tab
needs them, forms that post to web routes which call the pipeline over the
service binding (0010). `RouteContext` gains a handle to those pipeline
actions when the desk is built (#139); it is a port, like the query layer.

### 10. Browser line

The latest versions of Chrome, Edge, Firefox and Safari. A platform feature
may be relied on once all three engines ship it (Baseline "Newly
available"); a feature still missing an engine is used only where the page
works without it.

### 11. Client files

What the browser loads from `/client/`: `ui.css`, the loader, one module
per island and their shared chunks.

```ts
// @bd/ui/build — the only area of @bd/ui that uses a Bun API
export interface ClientFile {
  path: string; // "ui.css", "loader.js", "Newsstand.island.js", "chunk-ab12.js"
  type: "text/css; charset=utf-8" | "text/javascript; charset=utf-8";
  body: Uint8Array;
}
export function buildClient(): Promise<readonly ClientFile[]>;
```

- **Local, from source:** the local adapter calls `buildClient()` when the
  site starts and serves the files from memory. Nothing is written, so
  every way of starting the site (the launcher, `verify-local`, the tests
  that call `startSite`) gets them without a step of its own.
- **The compiled executable:** `build:local` writes the files to a folder
  and embeds that folder with `--asset`; the adapter serves the embedded
  files and never builds.
- **Cloudflare:** wrangler's build command writes them into
  `apps/web/public/client/` (git-ignored), served as static assets.
- Files under `/client/` are revalidated on every load (ETag), not cached
  for long, so a page and its island modules come from the same deploy.
- The build's root is the package folder, not the working directory, so
  chunk names do not change with where it is run from.
- Fonts stay in `apps/web/public/fonts`.

### 12. Catalog and guardrails

- `/_catalog` is a route of the local adapter (`apps/web/src/local`), so
  the Cloudflare adapter never has it. It renders the list exported by
  `@bd/ui/catalog`; a test fails when a `*.states.tsx` is missing from
  that list (#258). Rendering every state on the server is also the test that no
  island touches a browser global while rendering.
- A state is a set of props. Hover and focus are not props: the screenshot
  run moves the pointer and the focus. A component whose layout depends on
  the language gets a named state per language with its own sample text;
  `@bd/ui` holds no string table. A state an island reaches only by a
  click (an open drawer) is given as a starting prop.
- Screenshots run with Playwright on Bun, in a CI job of their own on one
  OS, which is also where baselines are made: a browser is not part of
  `bun install`, and a baseline made on macOS does not match Linux. `check`
  stays free of a browser download.
- `check-deps` holds the layer rules. A `check-ui` script (#259) fails on:
  a literal colour or size in a `.css` file outside `tokens` (a listed
  breakpoint in a query excepted); `document` or `window` outside a
  `*.island.tsx`; `dangerouslySetInnerHTML` outside `Document`; an island
  importing an island, or a value from `@bd/contracts`; a tracked `.css`
  file in `apps/*` or a `style=` in a page (`icon.ts` excepted, section
  4); a `.tsx` whose first line is not its JSX pragma; a
  component folder without states or a spec.

## One-way doors

- **Preact as the component model.** Every component is written against
  it. Moving to React later is mostly an import change (`preact/compat`
  goes the other way); moving to anything else is a rewrite.
- **The island contract**: JSON props, the `<bd-island>` element, and
  `/client/<Name>.island.js`. Cached pages and the loader must agree, so a
  change needs both to move together.
- **Class names as the styling hook.** Pages and tests will select on them.
- **`@bd/ui/tokens` function names**, once emails and share cards use them.

## Challenge

An agent with no context from the writing session was asked to break shape
A. Round 1 proved eight things; each is settled above.

| Finding | Settled by |
| --- | --- |
| Screenshot checks need a browser download in CI and per-OS baselines | section 12: a job of their own on one OS |
| A build in `scripts/` cannot be imported by a ruled file, and a `package.json` pre-step is skipped by everything that starts the site directly | section 11: `@bd/ui/build`, called by the adapter, in memory |
| A `.tsx` reached from the adapters or `apps/local` fails without JSX settings; mail files compile for Preact there | section 3 |
| `light-dark()` rejects a whole shadow | section 4: non-colour themed tokens keep three blocks |
| `tokens.json` lacks the control height and breakpoints; a query cannot use a variable | sections 4 and 5: `supplement.ts`, listed breakpoints |
| JSON props in a `<script>` child are entity-encoded or need raw HTML | section 2: props in an attribute |
| The first prop constraint rejected interfaces with a misleading error and accepted a `Map` under `{}` | section 2: `Jsonable<T>` |
| #257 contradicts this record | "What this changes" |

Round 2, a new agent against the revised record, found nothing that
breaks the shape and five things the record did not say; the round 1 fixes
it re-probed held (the build in memory from source, embedded files in a
compiled executable run from an empty folder, wrangler's build command,
props in an attribute, `tsc` in every workspace).

| Finding | Settled by |
| --- | --- |
| JSX settings in a tsconfig do not reach Bun's runtime when it starts from the repository root: `bun test` and local mode failed | section 3: a pragma on the first line of every `.tsx` |
| `Jsonable<T>` rejects `unknown` (one desk contract) and accepts `object`, `{}` and `any` | section 2: stated as limits |
| The build area needs Bun's types, and `apps/web` importing `preact` fails `check-deps`; the plan named neither | plan: `ui-server-render` and `ui-css` |
| The record let the catalog import `@bd/mail`; the plan forbade `apps/web` from importing it | sections 7 and 12 |
| #258 wants hover, focus and three languages per state; a state holds props only | section 12 |

Round 3, a third agent, again found nothing that breaks the shape. It
re-ran the pragma under `bun test`, the launcher, `tsc` in every workspace,
a compiled executable and both Workers, and read the desk, search,
language, analytics, caching, feed and accessibility issues against the
record without proving any of them impossible. It proved eight more gaps.
They are settled below but, the budget being three rounds, not challenged
again; the review of this record's pull request reads them next.

| Finding | Settled by |
| --- | --- |
| The pragma does not reach wrangler's bundler: without a file named `tsconfig.json` the Worker throws `React is not defined` | section 3 |
| The Cloudflare smoke run fetches only the pipeline, so it passed with a dead site | plan: the smoke run fetches a bd-web page |
| Styles kept inline through the renderer are entity-encoded (`format(&quot;woff2&quot;)`) | plan order: the stylesheet becomes a linked file before pages move to Preact |
| `bun.lock`, `typecheck` scripts and tsconfigs were not named as changes to the check | plan: each issue names them |
| #105, #129, #143, #258 and #259 are not tied to the plan's issues | "What this changes" |
| `scripts/check-colors.ts` scans `apps/web/src` only; after the move it guards nothing | plan: `ui-css` extends it |
| The catalog's list of states had no place a local adapter could import | section 3: the `catalog` area |
| An island cannot take `children`; class instances with only fields pass the type | section 2 |

## Risks

Raised and not proven, or still open.

- `preact/compat` with a React library was shown on the server and as a
  bundle, not running in a browser.
- The share-card engine is unknown (spike). Chinese and Japanese cards need
  CJK fonts inside the pipeline Worker.
- `@react-email/components` is deprecated in favour of `react-email` 6,
  which also carries the CLI's dependencies; the mail issue picks the
  import that keeps the Worker bundle small and records the size.
- Playwright on Bun is opt-in and young.
- There is no hot reload: a change needs a restart and a refresh.
- Chinese and Japanese pages add two Noto families each (#147); their size
  is not measured.
- A page cached across a deploy (#70) can meet newer island modules; a
  deploy that changes an island's props must purge.
- The desk's in-place language switch (#139) is a reload under this shape
  unless a whole desk page is one island (an island is a leaf); unsaved
  form input would be lost.
- "A change in the result count is announced" (#142) presupposes results
  that update without a load: the results list would be an island.
- "English pages load no Noto font" (#147): echo titles carry their own
  `lang`, so the font stack must key on `html[lang]`.
- Whether `wrangler preview` runs the build command was read in its source,
  not run.
- The Mail tab's live preview (#156) is a round trip to the pipeline per
  edit.
- On Windows, embedded file names may use `\`; the compiled executable was
  probed on macOS only.
- Preact 11's types reject an optional `href` passed straight to `<a>`
  under `exactOptionalPropertyTypes`; components will spread it
  conditionally.

## Signs the shape is wrong

For whoever builds from this record. On any of these, stop and ask the
owner; do not patch around it.

- An island needs a function or a class instance as a prop, or two islands
  need to share state.
- A page needs CSS of its own, or a component needs a literal value.
- A component needs to know whether it is on the server or in the browser
  outside an island.
- `apps/web` grows a component, or `@bd/ui` needs to read the query layer.
- The same React library is wanted in a third island.
- A page needs to change without a load in a way a link cannot do.

## Open for the owner

- **The desk's language switch (C9).** The design says the desk switches
  language in place. Under this shape a switch is a reload that keeps the
  stored choice, unless a whole desk page is one island. This record does
  not decide it; #139 needs the owner's answer.
- **`supplement.ts`** (section 5) departs from "values come only from
  `tokens.json`" until the design export carries those values.

## What this changes

- #56: the choice is this record. Adopting it is the plan's
  `ui-server-render`; the database criteria stay with #57.
- The plan's order is `ui-tokens`, `ui-css`, `ui-server-render`,
  `ui-islands`: the stylesheet becomes a linked file before pages move to
  Preact, because the renderer entity-encodes text inside `<style>`.
- #257: contradicts this record (three layers, no dependency but
  `@bd/contracts`, byte-identical output, string-rendering functions). The
  plan's first four issues replace it; the owner closes or rewrites it.
- "Depends on" in existing issues, for the owner to set when the plan's
  issues exist and before #257 is closed (closing it first would make #258
  pickable; #259 waits for the owner by its label; #105 is pickable
  today): #105 on `ui-islands`; #129 on
  `share-card-engine`; #143 on `mail-package`; #258 and #259 on
  `ui-islands` in place of #257.
- #258: its screenshot check moves out of `check` into a CI job of its own,
  which changes `.github` (protected); hover, focus and languages follow
  section 12.
- #259: its check takes the list in section 12.
- `AGENTS.md` (protected): the architecture map gains `packages/ui` and
  `packages/mail`, and the enforcement table gains the UI rows. Each issue
  that makes one of them true changes the file in the same PR.
- `bun.lock`, `tsconfig.base.json`, the new packages' tsconfigs and
  `typecheck` scripts, root `package.json` scripts, `.gitignore` and
  `scripts/check-deps.ts` change; all are part of how `bun run check` works
  (`docs/development.md`, "The gate here"). Each issue names its own.
