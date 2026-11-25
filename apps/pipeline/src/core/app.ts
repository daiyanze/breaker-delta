/**
 * The pipeline's app core (ADR 0018). It depends only on the ports and on
 * standard Web APIs, so the same code runs locally on Bun and on Cloudflare.
 * Adapters build the ports, then call `fetch` for each request and `tick` on
 * their schedule.
 *
 * `tsconfig.json` compiles `src/core` and `src/sources` with standard Web
 * APIs only (lib WebWorker, no `types`), so using a Bun or Cloudflare API
 * here is a compile error. `scripts/check-deps.ts` rejects the imports.
 */
import type { Settings } from "@bd/contracts";
import { slotId } from "@bd/core";
import { drizzleOver } from "@bd/db";
import { type DriverPrompts, driverPrompts, PROMPTS } from "@bd/judge";
import type { Blobs, Clock, Database, SiteCache } from "@bd/ports";
import { ADAPTERS } from "../sources/adapters/index.ts";
import { LAUNCH_GROUPS } from "../sources/launch-groups.ts";
import { probeAll } from "../sources/probe.ts";
import { PROBE_TARGETS } from "../sources/probe-targets.ts";
import { type ModelDriverName, parseModelDriver, runModel, type SecretReader } from "./model.ts";
import { runSlot, type Step } from "./runner.ts";
import { lastRun } from "./runs.ts";
import { readSettings } from "./settings.ts";
import { buildSteps } from "./steps.ts";

export interface PipelinePorts {
  db: Database;
  clock: Clock;
  /** Raw responses, page texts and drafts (scan, ingest, enrich, summarize, validate, commit, retention). */
  blobs: Blobs;
  /**
   * The site's cache, for the publish step. Absent where no site is bound
   * (Cloudflare previews have no `SITE`): the run then purges nothing and
   * publish still finishes (`NO_SITE`).
   */
  site?: SiteCache;
  /** Outbound HTTP for the scan step. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /**
   * Outbound HTTP for model calls. Defaults to the global `fetch`, not to
   * `fetch` above, which local mode may point at recorded source fixtures.
   */
  modelFetch?: typeof fetch;
  /**
   * Reads the secret a provider's `apiKeyRef` names (`model.ts`): an
   * environment variable locally, a Worker secret on Cloudflare. Absent: no
   * secret is set, so only providers without a key are called.
   */
  secret?: SecretReader;
}

/** The site where there is none: nothing is cached, so nothing is dropped. */
export const NO_SITE: SiteCache = { purge: async () => ({ purged: 0 }) };

/**
 * What the adapter passes in. Behaviour (the run interval, step attempts,
 * the lease) is not here: each tick reads it from the settings table
 * (invariant 9), so a change applies at the next tick.
 */
export interface PipelineConfig {
  /** Guards /__probe and /__tick. Null means those routes do not exist. */
  probeToken: string | null;
  /** The model driver (`MODEL_DRIVER`, `model.ts`). Null: the chains from settings. */
  model: ModelDriverName | null;
  /**
   * The messages the chains send (`model.ts`): the shipped `PROMPTS` from
   * `@bd/judge` (`pipelineConfig`). A task with no prompt here has its step
   * skipped; absent: every model step is skipped. Tests pass their own.
   */
  prompts?: DriverPrompts;
}

/**
 * Configuration from plain string variables; the same names in every
 * adapter. Throws on an unknown `MODEL_DRIVER`.
 */
export function pipelineConfig(vars: {
  PROBE_TOKEN?: string | undefined;
  MODEL_DRIVER?: string | undefined;
}): PipelineConfig {
  return {
    probeToken: vars.PROBE_TOKEN ? vars.PROBE_TOKEN : null,
    model: parseModelDriver(vars.MODEL_DRIVER),
    prompts: driverPrompts(PROMPTS),
  };
}

export interface TickResult {
  slot: string;
  /** True when this tick ran the slot, from the start or resumed. */
  started: boolean;
  /** The run ended in `done` or `failed`; absent when nothing ran. */
  status?: "done" | "failed";
  resumed?: boolean;
  reason?: string;
}

export interface Pipeline {
  fetch(request: Request): Promise<Response>;
  /**
   * Run the current slot unless it already finished or another runner holds
   * it. Resolves when the run ends.
   */
  tick(): Promise<TickResult>;
}

/**
 * `steps` replaces the run's steps (tests, scripts); by default they are the
 * full run (`buildSteps`) over these ports and this config, built at each
 * tick with that tick's settings, which hold the provider chains.
 */
export function createPipeline(
  ports: PipelinePorts,
  config: PipelineConfig,
  steps?: readonly Step[],
): Pipeline {
  const db = drizzleOver(ports.db);
  const secret: SecretReader = ports.secret ?? (() => undefined);
  const stepsFor = (settings: Settings): readonly Step[] =>
    steps ??
    buildSteps({
      blobs: ports.blobs,
      fetch: ports.fetch ?? fetch,
      model: runModel(
        config.model,
        settings,
        secret,
        ports.modelFetch ?? fetch,
        config.prompts ?? null,
      ),
      site: ports.site ?? NO_SITE,
      groups: LAUNCH_GROUPS,
      adapters: ADAPTERS,
    });
  const notFound = () => new Response("not found", { status: 404 });

  async function tick(): Promise<TickResult> {
    const now = () => ports.clock.now();
    const { settings } = await readSettings(db, now());
    const slot = slotId(now(), settings.runIntervalMinutes);
    const outcome = await runSlot(db, now, slot, stepsFor(settings), {
      maxAttempts: settings.stepMaxAttempts,
      leaseMs: settings.runLeaseMinutes * 60_000,
    });
    switch (outcome.status) {
      case "finished":
        return { slot, started: false, reason: "slot already ran" };
      case "busy":
        return { slot, started: false, reason: "slot is running" };
      case "done":
        return { slot, started: true, status: "done", resumed: outcome.resumed };
      case "failed":
        return {
          slot,
          started: true,
          status: "failed",
          resumed: outcome.resumed,
          reason: `step ${outcome.step} failed: ${outcome.error}`,
        };
    }
  }

  function authorized(request: Request): boolean {
    if (config.probeToken === null) return false;
    return request.headers.get("authorization") === `Bearer ${config.probeToken}`;
  }

  async function handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return Response.json({ ok: true, lastRun: await lastRun(db) });
    }
    if (pathname === "/__probe" || pathname === "/__tick") {
      if (!authorized(request)) return notFound();
      if (pathname === "/__tick") return Response.json(await tick());
      return Response.json(await probeAll(PROBE_TARGETS, ports.fetch ?? fetch));
    }
    return notFound();
  }

  return { fetch: handle, tick };
}
