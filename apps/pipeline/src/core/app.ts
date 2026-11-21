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
import { slotId } from "@bd/core";
import type { Clock, Database, RunExecutor } from "@bd/ports";
import { probeAll } from "../sources/probe.ts";
import { PROBE_TARGETS } from "../sources/probe-targets.ts";
import { findRun, lastRun } from "./runs.ts";

export interface PipelinePorts {
  db: Database;
  clock: Clock;
  runs: RunExecutor;
  /** Outbound HTTP. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export interface PipelineConfig {
  runIntervalMinutes: number;
  /** Guards /__probe and /__tick. Null means those routes do not exist. */
  probeToken: string | null;
}

/** Configuration from plain string variables; the same names in every adapter. */
export function pipelineConfig(vars: {
  RUN_INTERVAL_MINUTES?: string | undefined;
  PROBE_TOKEN?: string | undefined;
}): PipelineConfig {
  return {
    runIntervalMinutes: Number(vars.RUN_INTERVAL_MINUTES) || 60,
    probeToken: vars.PROBE_TOKEN ? vars.PROBE_TOKEN : null,
  };
}

export interface TickResult {
  slot: string;
  started: boolean;
  reason?: string;
}

export interface Pipeline {
  fetch(request: Request): Promise<Response>;
  /** Start a run for the current slot unless that slot already has one. */
  tick(): Promise<TickResult>;
}

export function createPipeline(ports: PipelinePorts, config: PipelineConfig): Pipeline {
  const notFound = () => new Response("not found", { status: 404 });

  async function tick(): Promise<TickResult> {
    const slot = slotId(ports.clock.now(), config.runIntervalMinutes);
    if (await findRun(ports.db, slot)) return { slot, started: false, reason: "slot already ran" };
    try {
      // The executor rejects a slot that has already started, so two ticks
      // racing past the check above still start one run.
      await ports.runs.start(slot);
      return { slot, started: true };
    } catch (err) {
      return { slot, started: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  function authorized(request: Request): boolean {
    if (config.probeToken === null) return false;
    return request.headers.get("authorization") === `Bearer ${config.probeToken}`;
  }

  async function handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      return Response.json({ ok: true, lastRun: await lastRun(ports.db) });
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
