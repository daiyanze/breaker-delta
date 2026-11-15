**English** | [简体中文](ROADMAP.zh-CN.md)

# Roadmap: From an Internal Radar Tool to a Subscribable Public Site

## Goal

Turn the morning/evening reports that currently only go back to a chat into a static site anyone can open and subscribe to via RSS/Atom:

- Site home: the latest edition + a historical archive
- One standalone page per edition (permalinks, shareable)
- Feeds: `/feed.xml` (RSS 2.0) and `/atom.xml` (Atom 1.0), one entry per edition with the full text in the feed, so subscribers read it all in their reader
- Later: one page per topic (using the grade-change history already in the ledger, to watch a topic grow from a 🌱 seed into a 🔥 must-see)

## End-state architecture

```
agent scan (driven by the user's own scheduling)
  → writes structured edition files editions/YYYY-MM-DD-{morning,evening}.json into the instance data repo (the single source of truth)
  → the data repo's CI checks out the engine repo and generates statically with @breaker-delta/publisher (Node/TypeScript, no framework)
  → site/ (wave board, rising board, seeds, categories, sources, topic pages, archive, feed.xml, atom.xml)
  → the data repo's GitHub Actions deploys to that repo's GitHub Pages
```

The design principle does not change: judgment belongs to the agent, deterministic work belongs to code. The edition file is the new contract between code and agent — the chat report will from now on be rendered from the same edition file, so the site and the chat never drift into two versions of the text.

## Key decisions

1. **Hosting: GitHub Pages first**: the repo is already on GitHub, Actions scaffolding exists, zero new accounts and zero cost; the output is pure static files, so moving to Cloudflare Pages later only changes the deploy target, not the content. Cloudflare's advantages (CDN speed, edge capabilities) are not needed at this scale.
2. **Write the generator ourselves, no Hugo/Jekyll**: the generator reads edition files + templates and emits HTML and feeds, at a controllable code size; no second toolchain is introduced. The implementation has since moved to Node/TypeScript with the full-stack migration (`@breaker-delta/publisher`; as of 0.21.0 the repo is Node-only) — the principle is unchanged.
3. **Ship two feeds**: RSS 2.0 has the best compatibility, Atom is the cleaner spec, and the cost is just one more template. One entry per edition; the `guid` is the edition date + morning/evening, permanently fixed; the full text goes into `content:encoded` / Atom `content`.
4. **Site URL: default domain first**: the site is hosted on the instance data repo's GitHub Pages (Dai's instance: `daiyanze.github.io/breaker-delta-data`); bind a custom domain (e.g. signals.grant-dai.com) once there are readers — GitHub Pages supports adding one at any time, and feeds build absolute links from the `base_url` config, so a domain change touches exactly one config value.

## Phases

### P0 Decisions ✅ Decided and in effect

- Hosting: GitHub Pages (chosen; Cloudflare Pages not adopted)
- Domain: default first (the data repo's Pages address), custom later (not yet bound)

### P1 Site MVP ✅ Shipped (the current site goes far beyond the MVP scope: wave board / rising board / categories / sources / topic pages / track record / seed submission, see the CHANGELOG)

- Define the `editions/*.json` edition format: date, edition, title, entries per grade (title / numbers / source links / suggested action), missing-source notes
- Write the static generator (now `@breaker-delta/publisher`, the Node edition; the original Python edition was retired with 0.21.0): generates the home page, edition pages, the archive page, feed.xml, atom.xml
- Minimal styling: a newspaper feel (serif headlines, grade color dots), no JS dependencies
- Backfill the two existing reports as edition files (the 2026-11-11 trial run, the 2026-11-12 morning report), so the site has content at launch
- GitHub Actions: after a push to the data repo, its CI checks out the engine repo, builds, and deploys Pages (the current form after the repo split)
- Completion criteria: the latest edition opens on mobile and desktop; the feeds pass the W3C validator; subscribing with any RSS reader delivers the full text

### P2 Automation loop (about one build)

- At the end of each morning/evening agent run, write the edition file in format and update the ledger, commit through the existing token channel (one commit, no approval cards), and let Actions deploy automatically — from scan to published with zero involvement from Dai
- Public-text cleaning: internal wording in the grading standard (such as "relevance to Dai") becomes neutral phrasing in the public edition; the agent distinguishes chat-edition and public-edition fields when reporting
- Completion criteria: 3 consecutive days, 6 editions, published automatically with zero manual operations

### P3 Experience polish (scheduled by reader feedback)

- Topic pages ✅ Shipped: generated from the ledger's grade history, one timeline per page (a wave-height history chart); title-slug URLs since 0.7.0
- Filtering by grade/source, in-site search (a static index, no backend)
- OG share images and meta, sitemap.xml, robots.txt ✅ Shipped (the 0.6.0 SEO/GEO/OG suite)
- Combined feeds: one "everything" feed, one "🔥 must-see only" feed

### P4 Options (only with a clear need)

- Custom domain + migration to Cloudflare Pages (when speed or edge features are needed)
- Email subscription built on the feeds (a third-party feed-to-email service; still no backend of our own)

## Explicitly not doing

- No dynamic backend, accounts, comments, or likes — the static site solves everything
- No new paid services for this project
- No changes to the local run structure: scans keep running in the existing scheduled jobs; local folders and ledger paths stay put

## Risks and notes

- GitHub Pages requires a public repo (it already is one); the site content is the full report text, so confirm before publishing that no internal information has leaked into edition files (P2's cleaning exists for exactly this)
- Links in feeds must be absolute URLs and stable for the long term: once an edition page URL is published, never rename or delete it
- If the repo is renamed again, the GitHub Pages default domain changes with it and old feed addresses break — bind a custom domain before renaming
