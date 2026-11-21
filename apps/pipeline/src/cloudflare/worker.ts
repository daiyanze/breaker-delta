/**
 * Cloudflare adapter for bd-pipeline (ADR 0018): maps the bindings onto the
 * ports and hands every request and cron tick to the app core.
 * `RunWorkflow` is interim and goes when the step runner lands (#171).
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { drizzleOver } from "@bd/db";
import type { RunExecutor } from "@bd/ports";
import { createPipeline, type Pipeline, pipelineConfig } from "../core/app.ts";
import { closeRun, openRun } from "../core/runs.ts";
import { d1Database } from "./d1.ts";

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
    const db = drizzleOver(d1Database(this.env.DB));
    await step.do("open", () => openRun(db, slot, Date.now()));
    // M1: scan -> ingest -> assign -> compute -> select -> enrich -> summarize
    //     -> validate -> commit -> publish, on the step runner (#171).
    await step.do("close", () => closeRun(db, slot, Date.now()));
    return { slot };
  }
}

function pipeline(env: Env): Pipeline {
  const runs: RunExecutor = {
    async start(slot) {
      // The slot is the instance id, so a duplicate create rejects.
      await env.RUN_WORKFLOW.create({ id: slot, params: { slot } });
    },
  };
  return createPipeline(
    { db: d1Database(env.DB), clock: { now: () => Date.now() }, runs },
    pipelineConfig(env),
  );
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return pipeline(env).fetch(request);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(pipeline(env).tick());
  },
} satisfies ExportedHandler<Env>;
