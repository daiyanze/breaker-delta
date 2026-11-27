# Read the front page

**What it is.** `/` is the front page (ADR 0015). Until the site lands in M3
it is a bare page built from the read contracts only: the latest edition,
its ranking and the classifieds. Without a query layer configured it is a
placeholder.

**How to reach it.** `up --fixtures <set>` makes the site read a fixture
set; `?set=` picks another set per request. Each language is its own
page: `/` is English, `/zh/` and `/ja/` the others (`languages.md`).

**Correct looks like:**

- `up` (no fixtures), `get /`: the placeholder, "The site arrives in
  milestone M3".
- `up --fixtures busy`, `get /`: "The ... edition. Sea state: ...", an
  ordered list of topics linking to `/topic/<slug>`, and a Classifieds list.
- `get "/?set=fresh"`: "The sea is flat." and the next scan time.
- `get /ja/` on `busy`: `<html lang="ja">`, Japanese headlines where
  the set has them, the source's own headline elsewhere.
- `get "/ja/?set=quiet"` (English only): redirected to `/?set=quiet`,
  `lang="en"`.
- `get "/?set=nope"`: 404 "unknown fixture set". Any path other than `/`
  (and its language versions, `languages.md`), `/health`, `/_catalog`
  (`catalog.md`) and the files under `/fonts/`, `/icons/` and `/client/`:
  404.
- `get /client/ui.css`: 200 `text/css`, starting with
  `@layer tokens, base, primitives, patterns;`. Every page links it; no
  page holds a `<style>` (#270).
- Every page is rendered by Preact on the server (#271): one line of HTML,
  each section a `<section class="Band" aria-labelledby="band-<id>">`, and
  text escaped by the renderer (`&lt;`, `&amp;`, `&quot;` in attributes).
- In a browser, the page follows the system's light or dark theme;
  `document.documentElement.dataset.theme = "dark"` (or `"light"`) set by
  hand overrides it: `getComputedStyle(document.documentElement)`
  gives the `paper` and `ink` colours of that theme.
- Every page's head holds the constant theme script and
  `<script type="module" src="/client/loader.js">` (#272). `get
  /client/loader.js` and `get /client/ThemeSwitch.island.js`: 200
  `text/javascript`.
- Every page opens with the masthead (#110): `<header class="page"><div
  class="Masthead">`, the round mark and "Breaker Delta" as one link home
  (the front page's `<h1>`), the navigation (Front page, Changes, Echoes,
  Track record, Sources, About; the front page's item with
  `aria-current="page"`), on `/zh/` and `/ja/` in that language with
  `/zh/…` and `/ja/…` links, then the wave line. `get` prints it as
  `<header class="page"><!-- masthead --></header>`; the saved file has it
  all. In a browser at 1440: the navigation at the wordmark's right, a red
  line under "Front page", a boat sailing the wave. At 390: a "Sections"
  button that opens the same links. With reduced motion on, the wave and
  the boat stand still.
- The masthead's row of tools holds the theme switch island (#105),
  `<bd-island name="ThemeSwitch" props="…"><button class="ThemeSwitch">`:
  a 44px square with a 1px outline and a half-filled circle (boards 01 and
  02), named "Switch to dark mode" in the light theme and "Switch to light
  mode" in the dark one (the other name has `display: none`); on `/zh/`
  and `/ja/` both names are in that language, from the string tables.
  In a browser: clicking it flips `data-theme` on `<html>` and stores the
  choice under `localStorage["bd-theme"]`; a reload keeps it, and the
  theme script sets `data-theme` before the first paint, so the other
  theme never shows first. The network list then has `loader.js`,
  `ThemeSwitch.island.js` and the `chunk-*.js` files (Preact).
- `--sun` computes to the same colour in both themes. At 1440 and 390
  wide, `document.documentElement.scrollWidth` equals the window's
  `innerWidth`: no horizontal scrollbar.
- The placeholder (`up` with no fixtures) has no island: its network list
  holds `loader.js` and no other JavaScript.

**Check it:**

```sh
bun scripts/verify-local.ts up --fixtures busy
bun scripts/verify-local.ts get /
bun scripts/verify-local.ts get /ja/
bun scripts/verify-local.ts get "/?set=fresh"
bun scripts/verify-local.ts get "/?set=nope"
bun scripts/verify-local.ts down
```

**Edges.** The site only reads. It never writes the database, so no `sql`
check changes after a `get`.
