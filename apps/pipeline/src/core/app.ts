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
import { SettingsSchema } from "@bd/contracts";
import { slotId } from "@bd/core";
import { drizzleOver } from "@bd/db";
import type { Clock, Database } from "@bd/ports";
import { probeAll } from "../sources/probe.ts";
import { PROBE_TARGETS } from "../sources/probe-targets.ts";
import { runSlot, type Step } from "./runner.ts";
import { lastRun } from "./runs.ts";
import { STEPS } from "./steps.ts";

export interface PipelinePorts {
  db: Database;
  clock: Clock;
  /** Outbound HTTP. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export interface PipelineConfig {
  runIntervalMinutes: number;
  /** Guards /__probe and /__tick. Null means those routes do not exist. */
  probeToken: string | null;
  /** Attempts per step before the run fails (settings: `stepMaxAttempts`). */
  stepMaxAttempts: number;
  /** Lease a runner holds on a run (settings: `runLeaseMinutes`). */
  runLeaseMinutes: number;
}

/** Configuration from plain string variables; the same names in every adapter. */
export function pipelineConfig(vars: {
  RUN_INTERVAL_MINUTES?: string | undefined;
  PROBE_TOKEN?: string | undefined;
}): PipelineConfig {
  // The settings table is read from #19; until then the defaults apply.
  const defaults = SettingsSchema.parse({});
  return {
    runIntervalMinutes: Number(vars.RUN_INTERVAL_MINUTES) || 60,
    probeToken: vars.PROBE_TOKEN ? vars.PROBE_TOKEN : null,
    stepMaxAttempts: defaults.stepMaxAttempts,
    runLeaseMinutes: defaults.runLeaseMinutes,
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

export function createPipeline(
  ports: PipelinePorts,
  config: PipelineConfig,
  steps: readonly Step[] = STEPS,
): Pipeline {
  const db = drizzleOver(ports.db);
  const notFound = () => new Response("not found", { status: 404 });

  async function tick(): Promise<TickResult> {
    const now = () => ports.clock.now();
    const slot = slotId(now(), config.runIntervalMinutes);
    const outcome = await runSlot(db, now, slot, steps, {
      maxAttempts: config.stepMaxAttempts,
      leaseMs: config.runLeaseMinutes * 60_000,
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
