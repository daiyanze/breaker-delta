# Run your Breaker Delta instance on Cloudflare Pages

> **Status: Beta.** The build half of both paths below is verified
> (it is the official instance's own build, byte for byte). The
> upload/connection half depends on your Cloudflare and GitHub
> accounts and is not covered by the project's own testing — the
> Docker path in the repo root remains the primary, fully verified
> self-hosting route.

Cloudflare serves the **static** form of a Breaker Delta instance:
your agent keeps producing editions in a data repo (or a local data
dir), and Pages rebuilds and hosts the site. (The official instance
at breakerdelta.com ran exactly this way until 2026-11-16; it has
since moved to the dynamic form — a Worker rendering from the same
data repo — and this Pages setup remains its rollback path.)

**Scale note:** the static form writes one file per page — at two
editions a day, a year of history is roughly 21,000 files / 390 MB,
which crosses the Pages free tier's 20,000-file limit at about day
342. Long-lived instances should prefer the dynamic form (the root
Docker image, or a Worker deployment as in `apps/web/README.md`),
which renders pages on demand and has no file-count ceiling.

You need: a data repo (or data dir) in the usual shape —
`config.yaml`, `editions/`, `state/`, `track-record.md`. Generate
one conversationally with the **breaker-delta-setup** wizard Skill,
or copy the reference data repo
[daiyanze/breaker-delta-data](https://github.com/daiyanze/breaker-delta-data).

## Path A — git-connected Pages project (automatic rebuilds)

1. Cloudflare dashboard → Workers & Pages → Create → Pages →
   Connect to Git → pick **your data repo**.
2. Build settings:
   - **Build command** (one line; this is the official instance's
     own command, with the engine repo URL being the only part you
     may ever change):

     ```bash
     git clone --depth 1 https://github.com/daiyanze/breaker-delta.git engine && cd engine && npm i -g bun && bun install --frozen-lockfile && bun run bundle && cd .. && bun engine/apps/cli/dist/breaker-delta.mjs --data-dir "$PWD" --root-dir "$PWD/engine" publish --out "$PWD/site"
     ```
   - **Build output directory**: `site`
3. Environment variables (Production):
   - `TS_BASE_URL` — your site's root URL, e.g.
     `https://your-project.pages.dev/` or your custom domain
   - `TS_DATA_REPO` — `your-name/your-data-repo`
4. Save and deploy. Every later push to the data repo rebuilds the
   site — that is how new editions go live.

**Known pitfall:** if pushes stop triggering builds, the GitHub
App's push subscription for the repo is the usual suspect; check
the project's deployment list — `github:push` triggers mean the
link works, `ad_hoc` means someone deployed by hand. A project
created through the API (not the dashboard) may need one manual
"Create deployment" in the dashboard before push builds start.

## Path B — Direct Upload (one command, manual rebuilds)

From a checkout of your data repo with this template's files in it
(`build.sh`, `wrangler.toml`, and your data under `data/`):

```bash
./build.sh            # clones the engine, publishes ./data -> ./site
npx wrangler pages deploy site --project-name my-breaker-delta
```

`wrangler` asks you to log in to your Cloudflare account on first
use. Re-run both commands whenever you want the hosted site to pick
up new editions — or let your agent run them after each push of new
data. Set `TS_BASE_URL` / `TS_DATA_REPO` in your shell before
`./build.sh` if the site lives on a custom domain.

## Custom domain

Pages project → Custom domains → add your hostname; if the zone is
on the same Cloudflare account, the DNS record is created for you.
Set `TS_BASE_URL` to the custom domain afterwards and rebuild once,
so canonical links, feeds and the sitemap point at it.
