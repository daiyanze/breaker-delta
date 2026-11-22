/**
 * The local adapter for bd-web (ADR 0018): Bun's HTTP server around the same
 * site core that runs on Cloudflare. The site only reads.
 */
import { handle, type SiteVars } from "../select.ts";
import { serveFont } from "./fonts.ts";

export interface LocalSiteOptions {
  /** 0 picks a free port. */
  port: number;
  /** Localhost only unless the owner says otherwise. */
  hostname?: string;
  vars: SiteVars;
}

export interface LocalSite {
  url: string;
  stop(): Promise<void>;
}

export function startSite(options: LocalSiteOptions): LocalSite {
  const server = Bun.serve({
    port: options.port,
    hostname: options.hostname ?? "127.0.0.1",
    fetch: (request) => serveFont(request) ?? handle(request, options.vars),
  });
  return {
    url: `http://${server.hostname}:${server.port}`,
    async stop() {
      await server.stop();
    },
  };
}
