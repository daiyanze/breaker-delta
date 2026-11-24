/**
 * The local adapter for bd-web (ADR 0018): Bun's HTTP server around the same
 * site core that runs on Cloudflare. The site only reads.
 */
import type { PurgeRequest, PurgeResult, SiteCache } from "@bd/ports";
import { purgeCaches } from "../core/purge.ts";
import { handle, type SiteVars } from "../select.ts";
import { serveFont } from "./fonts.ts";
import { serveIcon } from "./icons.ts";

export interface LocalSiteOptions {
  /** 0 picks a free port. */
  port: number;
  /** Localhost only unless the owner says otherwise. */
  hostname?: string;
  vars: SiteVars;
  log?: (line: string) => void;
}

/**
 * `purge` is the `SiteCache` port the local pipeline calls in process
 * (#35): no HTTP route, so nothing else on the machine can call it.
 */
export interface LocalSite extends SiteCache {
  url: string;
  stop(): Promise<void>;
}

export function startSite(options: LocalSiteOptions): LocalSite {
  const log = options.log ?? ((line: string) => console.log(line));
  const server = Bun.serve({
    port: options.port,
    hostname: options.hostname ?? "127.0.0.1",
    fetch: (request) => serveFont(request) ?? serveIcon(request) ?? handle(request, options.vars),
  });
  return {
    url: `http://${server.hostname}:${server.port}`,
    async purge(request: PurgeRequest): Promise<PurgeResult> {
      const result = await purgeCaches(request);
      // Ids and counts only (invariant 6).
      log(
        `[site] purge ${request.slot}: ${request.topicIds.length} topics, ${result.purged} dropped`,
      );
      return result;
    },
    async stop() {
      await server.stop();
    },
  };
}
