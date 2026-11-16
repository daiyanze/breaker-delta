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
a `breaker-delta-data` checkout next to the engine repo. Storage is
plain files for now — P2b moves it behind SQLite/D1 without the
pages changing.

Routes so far: `/{lang}` (board, `?e=<n>` renders a past edition's
board), `/{lang}/topic/{slug}`, `/{lang}/category/{key}` for
lang ∈ zh/en/ja. Plugin panels (creator / investor / watchlist, …)
render from the same declarative `panel.yaml` definitions as the
static build.

## Cloudflare target

```bash
BD_TARGET=cf bun x vite build
```

adds the `@cloudflare/vite-plugin`; the Worker config lives in
`deploy/cloudflare.config.ts` (kept out of the app root so plain
Node builds don't trip vinext's Cloudflare detection).
