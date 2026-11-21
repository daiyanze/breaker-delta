/** Cloudflare adapter for bd-web (ADR 0018). */
import { handle, type SiteVars } from "../select.ts";

export type Env = SiteVars;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
} satisfies ExportedHandler<Env>;
