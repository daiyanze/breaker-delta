# Breaker Delta

Catch waves before they break. Breaker Delta collects **echoes** (individual
items from many independent sources), stacks echoes about the same topic, and
calls it a **wave** once at least two independent sources agree. Every wave is
checked again 14 days later, and the track record is public.

> Status: 2.0 rewrite, milestone M0 (scaffold). Nothing here publishes yet.

## Two ways to run

| Mode | Needs | Command |
| --- | --- | --- |
| Local | Bun, no cloud account | `bun install && bun run local` |
| Cloudflare | Workers Paid account | see `docs/deploy-cloudflare.md` (M4) |

Both modes run the same code. Local mode runs on Bun alone; Cloudflare is a
deployment adapter. See `docs/adr/0018-local-first-runtime.md`.

## Develop

```sh
bun install
bun run check      # typecheck + lint + tests + dependency-direction check
bun run probe      # M0 spike: which sources are reachable from this network
bun run local      # M0: run the pipeline on this machine (wrangler until ADR 0018 lands)
```

## Layout

```
packages/contracts  Zod contracts (model calls, settings, read models for site and desk)
packages/core       Pure rules: independent sources, wave, wave height. No IO.
packages/db         Schema and migrations (D1 on Cloudflare, SQLite locally)
packages/fixtures   Fixture data and query layer behind the read contracts
packages/judge      Model provider chain (OpenAI-compatible HTTP)
packages/ports      Runtime ports (database, blobs, clock, runs) and adapter checks
apps/pipeline       Pipeline: app core plus local (Bun) and Cloudflare adapters
apps/web            Site and read-only API: app core plus adapters (stub until M3)
apps/local          Local launcher and model bridge
docs/adr            Architecture decisions, one per file
evals               Evaluation cases captured from real runs (from M2)
```

Read `CLAUDE.md` before changing anything; it lists the invariants.

## License

Apache-2.0.
