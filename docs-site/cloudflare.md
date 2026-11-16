# Cloudflare Pages projects (route A: native Git builds)

Hosting decided 2026-11-16: both Breaker Delta sites live on
**Cloudflare Pages**, each project connected straight to its GitHub
repo and built by Cloudflare on every push. No `breaker-delta-docs`
repo, no GitHub Actions deploys. Domain layout: main site at the
apex `breakerdelta.com`, docs at `docs.breakerdelta.com`,
`app.breakerdelta.com` reserved.

Both build commands below were validated locally from fresh clones
on 2026-11-16 (docs: 27 pages; main: full site, canonical on
breakerdelta.com, no docs pages, Docs tab linking out) — first with
the Node toolchain, then re-validated after the same-day migration
to Bun (the `npm i -g bun` bootstrap step is Cloudflare-specific;
locally Bun is already on PATH).

**Status (2026-11-16, midday):** both projects below were created
via the Cloudflare API with exactly these settings, after a false
start in which the docs hostname was attached to a dashboard-template
Worker (`breaker-delta-docs`, Hello World) instead of a Pages
project — the Worker was deleted and the hostname moved. Two
operational notes from the bring-up: a project created through the
API does not build on git pushes alone — the first builds ran only
after a manual "Create deployment" in the dashboard (trigger type
`ad_hoc`) — and attaching a domain through the API still needs the
matching CNAME record created by hand. The docs site is live at
docs.breakerdelta.com and the main site at breaker-delta.pages.dev;
the apex domain was attached right after. Whether pushes trigger
builds automatically after the manual first deployment is exactly
what the commit carrying this note tests.

## Project 1 — docs (breaker-delta-docs)

- Connect repository: **daiyanze/breaker-delta** (the engine repo)
- Production branch: `main`
- Framework preset: None
- Build command (Cloudflare's build image has no Bun preinstalled,
  so the first step installs it via npm):
  `npm i -g bun && bun install --frozen-lockfile && bun run bundle && bun apps/cli/dist/breaker-delta.mjs docs --out site`
- Build output directory: `site`
- Environment variables:
  - `TS_DOCS_URL=https://docs.breakerdelta.com/`
  - `TS_MAIN_URL=https://breakerdelta.com/`
- Custom domain: `docs.breakerdelta.com`

Every engine push rebuilds the docs automatically — that is the
docs update path (edit `packages/publisher/src/docs.ts`, push, done).

## Project 2 — main site (breaker-delta)

- Connect repository: **daiyanze/breaker-delta-data** (the data repo)
- Production branch: `main`
- Framework preset: None
- Build command (one line; the build clones the public engine repo
  into `engine/` first — the same cross-repo pattern as the old
  GitHub Actions workflow, and the engine MUST stay public or this
  clone fails):
  `git clone --depth 1 https://github.com/daiyanze/breaker-delta.git engine && cd engine && npm i -g bun && bun install --frozen-lockfile && bun run bundle && cd .. && bun engine/apps/cli/dist/breaker-delta.mjs --data-dir "$PWD" --root-dir "$PWD/engine" publish --out "$PWD/site"`
- Build output directory: `site`
- Environment variables:
  - `TS_BASE_URL=https://breakerdelta.com/`
  - `TS_DATA_REPO=daiyanze/breaker-delta-data`
- Custom domain: `breakerdelta.com` (apex; add `www` as a redirect
  to the apex if wanted)

Data pushes (the twice-daily scans) rebuild the main site
automatically, and each build pulls the engine's current `main`, so
engine releases ride along — same behaviour as the old workflow.

## Bring-up & cutover checklist

1. Put `breakerdelta.com` DNS on Cloudflare (register or transfer
   the domain, or point its nameservers at Cloudflare).
2. Create the two Pages projects above; let each finish a first
   build and verify it on its `*.pages.dev` address (docs hub loads,
   main board loads, canonicals point at the real domains).
3. Attach the custom domains (`docs.breakerdelta.com`,
   `breakerdelta.com`) and wait for the certificates to go active.
4. **Only now** push the engine's docs-split commit and let the data
   repo rebuild once — order matters: the main site's next build
   drops its in-site docs pages and points the Docs tab at
   docs.breakerdelta.com, so the docs site must already answer.
5. After the Cloudflare sites verify live, retire the old hosting:
   disable the data repo's GitHub Actions Pages workflow (keep the
   file for history) so the two systems never deploy over each other.
   Keep the github.io addresses as a fallback until then.

## Notes

- Preview deployments: Cloudflare builds non-production branches
  too by default; leave on for PR previews or switch off in each
  project's Settings → Builds & deployments.
- Rollback: re-enable the data repo's GitHub Actions workflow and
  remove the Cloudflare custom domains; DNS follows the domains.
