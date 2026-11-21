# 0018 Local-first runtime; Cloudflare is an adapter

Date: 2026-11-21. Status: accepted. Supersedes 0004.

## Decision

The product runs on Bun on its own. Cloudflare is one deployment adapter,
not the runtime local mode imitates.

- The pipeline and the site depend only on ports:

  | Port | Local (default) | Cloudflare adapter |
  | --- | --- | --- |
  | Database | `bun:sqlite` file | D1 |
  | Blobs | a directory | R2 |
  | Clock | `Date.now` | `Date.now` |
  | Run execution | step runner | the same step runner, called from the cron handler |
  | Mail, models | configured transports (0005, 0012) | same |

- Scheduling is not a port. The core exports `tick()`, and each adapter
  decides when to call it: an in-process timer locally, a cron trigger on
  Cloudflare.
- Both databases speak SQLite and share one schema and one set of migrations.
  The Database port is a small SQL interface (`all`, `values`, `first`,
  `run`, `batch`) that both adapters implement and pass the same
  conformance checks for. The core writes typed queries with drizzle on top
  of it, through drizzle's `sqlite-proxy` driver (`drizzleOver` in
  `@bd/db`). Native drizzle drivers are not used: D1 has no interactive
  transactions and bun-sqlite has no `batch`, so an atomic write is always a
  port `batch` of write statements.
- One run is a plain function over the ports. A step runner records each
  step's result in a `run_steps` table, keyed by slot and step, so a run that
  stops halfway resumes where it stopped. Cloudflare Workflows are not used:
  both modes run the same runner, so there is one main loop and no
  orchestration that behaves differently per platform.
- Local mode ships as one executable per OS built with `bun build --compile`
  (macOS, Linux, Windows), with migrations embedded. A user downloads one file
  and runs it; no clone, no `bun install`, no wrangler.
- Wrangler, miniflare and workerd are only needed to build and deploy the
  Cloudflare adapter. Nothing on the local path imports `cloudflare:*` or a
  Cloudflare type.
- The site runs locally on Bun's own HTTP server. A frontend framework is
  only used if it runs on Bun without the Workers runtime.

## Why

Spike 1 showed the Workers runtime runs locally through wrangler, offline
and on three OSes (`docs/spikes/m0.md`). It is still not adopted, because
it makes Cloudflare's toolchain a requirement of local mode:

- several hundred MB of tooling, with versions that follow Cloudflare;
- Workflows, D1 and R2 are emulated locally, so local mode can only be as good as
  the emulation;
- a one-command install would have to carry wrangler along.

Being able to run locally is the prerequisite. Deployment targets adapt to
it, not the other way round.

## Consequences

- `apps/pipeline` and `apps/web` are split into an app core (no
  `cloudflare:*` import) and thin entry points per adapter. A
  dependency-direction rule enforces it.
- The `RunWorkflow` class and the `workflows` binding are removed when the
  step runner lands.
- The `spike-local` CI job keeps running on three OSes; it switches from the
  wrangler launcher to the native executable when that exists.
- The `vinext` choice for the site is checked against "runs on Bun without
  the Workers runtime"; if it does not, the site uses a framework that does.
- Invariant 8 ("no cloud-only service on the required path") stays and is
  stricter in practice: the required path also has no cloud vendor's tooling.

## Amendment (2026-11-21, #177)

Run execution is the core's step runner (`apps/pipeline/src/core/runner.ts`),
not a port: both runtimes call the same code, so the `RunExecutor` port that
#175 added for the interim Workflow is removed. The ports are Database,
Blobs and Clock.

