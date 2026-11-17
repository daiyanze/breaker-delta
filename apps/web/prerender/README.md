# Static prerender (Rewrite Phase 3c)

Renders the web app's React page components into the static
site's file layout — the migration path that retires the
publisher's string templates page type by page type. Each page
type switches only after it passes the normalized equivalence
gate against the frozen golden build (`compare.py`: visible
text + link inventory per page; byte equality is not expected —
React comment nodes and attribute order differ by construction).

## Pieces

- `vite.config.ts` — a standalone SSR build (NOT the vinext
  config): bundles `main.tsx` for Node with `@vitejs/plugin-react`.
- `navigation.ts` / `link.tsx` — `next/navigation` / `next/link`
  shims (pages only call `notFound()`/`redirect()` on invalid
  input; a Link is an anchor whose href is rewritten afterwards).
- `main.tsx` — the renderer: document shell mirroring the
  publisher's `page()` (head/meta/CSS/theme scripts), body
  cleanup, and the web→static href rewriting
  (`/<lang>/category/<k>` → `category-<k>.html`, etc.).

## Run the pilot (about × 3 languages)

```bash
cd apps/web
bun x vite build --config prerender/vite.config.ts
BD_DATA_DIR=<data dir> BD_ENGINE_DIR=<engine root> \
  PRERENDER_OUT=<out dir> node prerender/dist/prerender.mjs
python3 prerender/compare.py <golden site dir> <out dir> \
  about.html en/about.html ja/about.html
```

Status: pilot (about) passes modulo the registered differences
in `~/workspace/breaker-delta-architecture/REWRITE-DESIGN.md`
(Phase 3 execution record). Remaining page types switch in
dependency order: landing → archive/track-record → board family
→ topic/edition → categories/sources/levels → plugin pages →
docs.
