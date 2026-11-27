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
  (and its language versions, `languages.md`), `/health` and the files
  under `/fonts/`, `/icons/` and `/client/`: 404.
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
- The front page's header holds the theme switch island,
  `<bd-island name="ThemeSwitch" props="…"><button class="ThemeSwitch">`.
  In a browser: clicking it flips `data-theme` on `<html>` and stores the
  choice under `localStorage["bd-theme"]`; a reload keeps it, and the
  theme script sets `data-theme` before the first paint, so the other
  theme never shows first. The network list then has `loader.js`,
  `ThemeSwitch.island.js` and the `chunk-*.js` files (Preact).
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
