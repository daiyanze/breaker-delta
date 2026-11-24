/** Cloudflare adapter for bd-web (ADR 0018). */
import { WorkerEntrypoint } from "cloudflare:workers";
import type { PurgeRequest, PurgeResult, SiteCache } from "@bd/ports";
import { purgeCaches } from "../core/purge.ts";
import { handle, type SiteVars } from "../select.ts";

export type Env = SiteVars;

/**
 * The `SiteCache` port for bd-pipeline's publish step (#35). A named
 * entrypoint, not a route: only a Worker with a service binding to it
 * (`entrypoint: "SiteCacheEntrypoint"`) can call it; the public URL cannot.
 */
export class SiteCacheEntrypoint extends WorkerEntrypoint<Env> implements SiteCache {
  purge(request: PurgeRequest): Promise<PurgeResult> {
    return purgeCaches(request);
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
} satisfies ExportedHandler<Env>;
