# @breaker-delta/web — the dynamic front end (P2)

The Next.js-API app that replaces the hand-written static templates,
built on [vinext](https://vinext.dev) (Next.js on Vite) so the same
codebase deploys to Cloudflare Workers (the official instance) and to
a plain Node server (Docker / self-host). Pages are React Server
Components rendering the same data, the same strings and the same
stylesheet as the static publisher — parity is checked page by page
against a static build of the same data directory.

## Run (Node target)

```bash
BD_DATA_DIR=/path/to/data-repo bun x vite dev      # develop
BD_DATA_DIR=/path/to/data-repo bun x vite build    # build
bun x vite preview                                 # serve the build
```

`BD_DATA_DIR` points at a data directory (`editions/`, `state/`,
optional `config.yaml` / `plugins/`); without it the app defaults to
a `breaker-delta-data` checkout next to the engine repo.

## Storage (P2b)

Pages read through one store interface (`lib/store.ts`):

- **Files** (default): the data directory itself.
- **SQLite**: set `BD_DB_PATH=<file.db>`; create/refresh the file with

  ```bash
  bun scripts/import.ts <data-dir> <file.db>
  ```

  The importer stores editions/ledger/config verbatim plus derived
  topic/appearance rows (computed by core's `buildTopics` at import
  time, so restarts don't repay its ledger matching), then verifies
  the database against the files item by item — counts, appearance
  sequences, and the full board history (incremental board-state
  computation over the DB vs the naive reference over the files).
- **D1**: `lib/store-d1.ts` runs the identical schema over a
  Cloudflare D1 binding for the Workers target (binding wiring lands
  with the P2c cutover).

Routes: `/{lang}` (board — slider + `?e=<n>` renders any past board
state), `rising`, `echoes`, `submit`, `categories`,
`category/{key}`, `level/{must|watch|echo}`, `sources`,
`source/{key}`, `track-record`, `archive`, `about`, `landing`,
`topic/{slug}`, `edition/{date}-{slot}` for lang ∈ zh/en/ja, plus
`/data/topics.json`, `/data/alerts.json`, `/feed.xml`, `/atom.xml`
(root and per language), `/sitemap.xml`, `/robots.txt`, `/llms.txt`
and `/icon-96.png`. Plugin panels (creator / investor /
watchlist, …) render from the same declarative `panel.yaml`
definitions as the static build.

## Cloudflare target

```bash
BD_TARGET=cf bun x vite build
```

adds the `@cloudflare/vite-plugin`; the Worker config lives in
`deploy/cloudflare.config.ts` (kept out of the app root so plain
Node builds don't trip vinext's Cloudflare detection).
