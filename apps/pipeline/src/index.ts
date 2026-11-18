/**
 * bd-pipeline: the only writer. M0 contains the ticker, an empty RunWorkflow
 * and the source probe used by spike 2. Steps arrive in M1.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { slotId } from "@bd/core";
import { PROBE_TARGETS } from "./sources/probe-targets.ts";
import { probeAll } from "./sources/probe.ts";

export interface Env {
  DB: D1Database;
  BLOBS: R2Bucket;
  RUN_WORKFLOW: Workflow;
  RUN_INTERVAL_MINUTES?: string;
  /** Guards /__probe and /__tick. Unset = those routes do not exist. */
  PROBE_TOKEN?: string;
}

interface RunParams {
  slot: string;
}

export class RunWorkflow extends WorkflowEntrypoint<Env, RunParams> {
  override async run(event: WorkflowEvent<RunParams>, step: WorkflowStep) {
    const { slot } = event.payload;

    await step.do("open", async () => {
      await this.env.DB.prepare(
        "INSERT OR IGNORE INTO runs (slot, status, started_at) VALUES (?1, 'running', ?2)",
      )
        .bind(slot, Date.now())
        .run();
    });

    // M1: scan -> ingest -> assign -> compute (board is fresh here)
    //     -> select -> enrich -> summarize -> validate -> commit -> publish
    // Steps pass ids only; data lives in the database and blob storage.

    await step.do("close", async () => {
      await this.env.DB.prepare(
        "UPDATE runs SET status = 'done', finished_at = ?2 WHERE slot = ?1",
      )
        .bind(slot, Date.now())
        .run();
    });

    return { slot };
  }
}

interface TickResult {
  slot: string;
  started: boolean;
  reason?: string;
}

/** Start a run for the current slot unless that slot already has one. */
export async function tick(env: Env, nowMs: number): Promise<TickResult> {
  const interval = Number(env.RUN_INTERVAL_MINUTES) || 60;
  const slot = slotId(nowMs, interval);
  const existing = await env.DB.prepare("SELECT slot FROM runs WHERE slot = ?1").bind(slot).first();
  if (existing) return { slot, started: false, reason: "slot already ran" };
  try {
    // The slot is the instance id, so a duplicate create fails instead of
    // starting a second run.
    await env.RUN_WORKFLOW.create({ id: slot, params: { slot } });
    return { slot, started: true };
  } catch (err) {
    return { slot, started: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function authorized(request: Request, env: Env): boolean {
  if (!env.PROBE_TOKEN) return false;
  return request.headers.get("authorization") === `Bearer ${env.PROBE_TOKEN}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") {
      const last = await env.DB.prepare(
        "SELECT slot, status, started_at, finished_at FROM runs ORDER BY started_at DESC LIMIT 1",
      ).first();
      return Response.json({ ok: true, lastRun: last ?? null });
    }

    if (pathname === "/__probe" || pathname === "/__tick") {
      if (!authorized(request, env)) return new Response("not found", { status: 404 });
      if (pathname === "/__tick") return Response.json(await tick(env, Date.now()));
      return Response.json(await probeAll(PROBE_TARGETS));
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(tick(env, Date.now()));
  },
} satisfies ExportedHandler<Env>;
