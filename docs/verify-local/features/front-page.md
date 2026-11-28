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
- On `busy`, a "Fading notices" band (#122) between the front page and
  the classifieds: one `<article class="Notice">` per wave in the
  edition's `ebb.notices`, each "A wave since Nov 13. Peaked at 188.
  Survived by 22 echoes." and "Now 144, down 18% in 24 hours" from the
  data, its title linking to `/topic/<slug>`; in the rail "Read the 1
  that went flat" (`/changes?type=went_flat`) and a sunset. On `/zh/` and
  `/ja/` the sentence is the same pattern in that language ("11月13日成浪。
  最高 188。身后留下 22 条回波。"). In a browser: the ripple drifts (none
  with reduced motion); three notices to a row at 1440 wide, two at 390;
  no horizontal scrollbar. An edition with no notice: the band is its name
  and "No wave is going out." (`apps/web/src/local/pages.test.ts`; no
  fixture set has one).
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
- The front page's header holds the theme switch island (#105),
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
- The tide table (#121), on `busy` after the front band: `<h2
  id="band-tide">Tide table</h2>`, a chart `<svg class="TideTable-svg"
  role="img" aria-label="5 stories became waves today, between 08:00 and
  14:00.">` with five red dots, and under it an `<ol>` of the same five
  waves, latest first, each linking to `/topic/<slug>`. On `/zh/` and
  `/ja/` its text is in that language ("潮汐表", "满潮 09:30"). Not on
  `quiet` (one new wave, board 19) or `fresh`. In a browser: the sea
  rises from the waterline over 1.2 seconds on load, its surface one smooth
  curve; at 1440, 1000 and 390 wide no horizontal scrollbar, and the
  labels keep their size (heights on the chart and the 03:00, 09:00, ...
  labels from the two-column width only).
- The front page ends with the footer (#111), `</main><footer
  class="Footer">`: on `busy`, which sends email, the subscribe form
  ("One email a day, with the new waves.", posting to `/subscribe`);
  on `?set=fresh` and `?set=quiet` no form, as the site sends no email.
  Then four links (three to `/about#height`, `#own`, `#open`, one to the
  repository), the lighthouse drawing and the bar "Breaker Delta is open
  source."; on `/zh/` and `/ja/` in that language. In a browser: the waves
  drift and loop without a gap, the beam sweeps without being cut at the
  top; under reduced motion nothing moves. At 390 wide only the drawing's
  right half shows (the lighthouse and the boat's side) and the links sit
  two to a row with their short labels. In the dark theme the rock and the
  front wave are darker than the page.
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
