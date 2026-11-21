/**
 * Cloudflare adapter for bd-pipeline (ADR 0018): maps the bindings onto the
 * ports and hands every request and cron tick to the app core. The cron
 * handler runs the core's step runner; Cloudflare Workflows are not used.
 */
import { createPipeline, type Pipeline, pipelineConfig } from "../core/app.ts";
import { d1Database } from "./d1.ts";

export interface Env {
  DB: D1Database;
  BLOBS: R2Bucket;
  RUN_INTERVAL_MINUTES?: string;
  /** Guards /__probe and /__tick. Unset = those routes do not exist. */
  PROBE_TOKEN?: string;
}

function pipeline(env: Env): Pipeline {
  return createPipeline(
    { db: d1Database(env.DB), clock: { now: () => Date.now() } },
    pipelineConfig(env),
  );
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return pipeline(env).fetch(request);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // The run continues after the handler returns, until it finishes.
    ctx.waitUntil(pipeline(env).tick());
  },
} satisfies ExportedHandler<Env>;
