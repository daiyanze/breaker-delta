# Read the front page

**What it is.** `/` is the front page (ADR 0015). Until the site lands in M3
it is a bare page built from the read contracts only: the latest edition,
its ranking and the classifieds. Without a query layer configured it is a
placeholder.

**How to reach it.** `up --fixtures <set>` makes the site read a fixture
set; `?set=` picks another set per request and `?lang=` a language.

**Correct looks like:**

- `up` (no fixtures), `get /`: the placeholder, "The site arrives in
  milestone M3".
- `up --fixtures busy`, `get /`: "The ... edition. Sea state: ...", an
  ordered list of topics linking to `/topic/<slug>`, and a Classifieds list.
- `get "/?set=fresh"`: "The sea is flat." and the next scan time.
- `get "/?lang=ja"` on `busy`: `<html lang="ja">`, Japanese headlines where
  the set has them, the source's own headline elsewhere.
- `get "/?lang=ja"` on `quiet` (English only): falls back to `lang="en"`.
- `get "/?set=nope"`: 404 "unknown fixture set". Any path other than `/`,
  `/health` and the files under `/fonts/`, `/icons/` and `/client/`: 404.
- `get /client/ui.css`: 200 `text/css`, starting with
  `@layer tokens, base, primitives, patterns;`. Every page links it; no
  page holds a `<style>` (#270).
- In a browser, the page follows the system's light or dark theme;
  `document.documentElement.dataset.theme = "dark"` (or `"light"`) set by
  hand overrides it: `getComputedStyle(document.documentElement)`
  gives the `paper` and `ink` colours of that theme.

**Check it:**

```sh
bun scripts/verify-local.ts up --fixtures busy
bun scripts/verify-local.ts get /
bun scripts/verify-local.ts get "/?lang=ja"
bun scripts/verify-local.ts get "/?set=fresh"
bun scripts/verify-local.ts get "/?set=nope"
bun scripts/verify-local.ts down
```

**Edges.** The site only reads. It never writes the database, so no `sql`
check changes after a `get`.
