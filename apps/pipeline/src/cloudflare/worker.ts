/**
 * Cloudflare adapter for bd-pipeline (ADR 0018): maps the bindings onto the
 * ports and hands every request and cron tick to the app core. The cron
 * handler runs the core's step runner; Cloudflare Workflows are not used.
 */
import type { SiteCache } from "@bd/ports";
import { createPipeline, type Pipeline, pipelineConfig } from "../core/app.ts";
import { stringVars } from "../core/model.ts";
import { d1Database } from "./d1.ts";
import { r2Blobs } from "./r2.ts";

export interface Env {
  DB: D1Database;
  BLOBS: R2Bucket;
  /**
   * The site's cache (#35): RPC over the service binding to bd-web's
   * `SiteCacheEntrypoint`, used as the publish step's `SiteCache` port as it
   * is. Previews do not bind it; the core then purges nothing (`NO_SITE`).
   */
  SITE?: SiteCache;
  /** Guards /__probe and /__tick. Unset = those routes do not exist. */
  PROBE_TOKEN?: string;
  /** Guards /__report, the read-only run report (#53). Unset = it does not exist. */
  REPORT_TOKEN?: string;
  /** The model driver (`src/core/model.ts`). Unset = the provider chains from settings. */
  MODEL_DRIVER?: string;
}

function pipeline(env: Env): Pipeline {
  return createPipeline(
    {
      db: d1Database(env.DB),
      clock: { now: () => Date.now() },
      blobs: r2Blobs(env.BLOBS),
      ...(env.SITE ? { site: env.SITE } : {}),
      // A provider key is the Worker secret its `apiKeyRef` names (#42).
      secret: stringVars(env as unknown as Record<string, unknown>),
    },
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
