/**
 * The site's cache purge, called by the pipeline's publish step (#35) through
 * the `SiteCache` port: in process locally, RPC over the service binding on
 * Cloudflare (`SiteCacheEntrypoint` in `src/cloudflare/worker.ts`).
 *
 * Placeholder: the site caches nothing yet, so there is nothing to drop and
 * `purged` is 0. When pages are cached (M3), this drops the front page and
 * the pages of `topicIds`. It never writes the content database: the site
 * only reads (invariant 7), and it has no database binding to write to.
 */
import type { PurgeRequest, PurgeResult } from "@bd/ports";

export async function purgeCaches(_request: PurgeRequest): Promise<PurgeResult> {
  return { purged: 0 };
}
