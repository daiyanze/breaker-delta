# Standalone docs site (docs.breakerdelta.com)

The Breaker Delta usage docs are a **separate site** from the radar
itself — they do not ship inside an instance's build. The main site's
「📖 文档 / Docs」 tab links out to the docs site, and the docs site
links back to the main site (breakerdelta.com).

## Pieces

- **Content**: `packages/publisher/src/docs.ts` in the engine repo
  (bilingual zh/en; Japanese pages render the English body with a
  notice). Nothing about the docs lives in any data repo.
- **Build**: `breaker-delta docs --out <dir>` renders the whole docs
  site from the engine root alone — no data dir, no editions.
  `--docs-url` / `TS_DOCS_URL` sets the docs site's own URL (canonical,
  hreflang, sitemap); `--main-url` / `TS_MAIN_URL` sets the main site
  the docs link back to. Relative links to main-site pages inside the
  docs bodies are rewritten to absolute main-site URLs at build time.
- **Hosting**: Cloudflare Pages, route A (native Git builds) —
  decided 2026-11-16. One Pages project per site, each connected
  straight to its GitHub repo; no separate docs repo is needed
  (Cloudflare allows several projects on one repo, unlike GitHub
  Pages' one-site-per-repo rule). Full project settings, build
  commands and the bring-up/cutover checklist: [cloudflare.md](cloudflare.md).

## Updating the docs

Edit `packages/publisher/src/docs.ts` and push the engine repo —
the docs Pages project rebuilds and deploys automatically. The main
site does not need a rebuild for docs changes.
