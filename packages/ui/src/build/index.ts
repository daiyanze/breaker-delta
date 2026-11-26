/**
 * `@bd/ui/build` (ADR 0020, section 11): the files the browser loads from
 * `/client/`. Today only `ui.css`; the loader and the island modules come
 * with `ui-islands`. The only area of `@bd/ui` that may use a Bun API.
 *
 * - Local, from source: the site's local adapter calls `buildClient()` at
 *   start and serves the files from memory.
 * - The executable: `build:local` writes them with
 *   `packages/ui/scripts/write-client.ts` and embeds the folder.
 * - Cloudflare: wrangler's build command writes them to
 *   `apps/web/public/client/`.
 */
import { uiCss } from "../styles/index.ts";

export interface ClientFile {
  /** Under `/client/`: "ui.css". */
  path: string;
  type: "text/css; charset=utf-8" | "text/javascript; charset=utf-8";
  body: Uint8Array;
}

export async function buildClient(): Promise<readonly ClientFile[]> {
  return [
    { path: "ui.css", type: "text/css; charset=utf-8", body: new TextEncoder().encode(uiCss()) },
  ];
}
