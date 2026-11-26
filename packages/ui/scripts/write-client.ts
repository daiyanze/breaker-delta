/**
 * Write the client files (`buildClient()`) into a folder, replacing what was
 * there: `bun packages/ui/scripts/write-client.ts <dir>`. `build:local`
 * writes `dist/client` and embeds it in the executable; wrangler's build
 * command writes `apps/web/public/client`, served as static assets.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { buildClient } from "../src/build/index.ts";

export async function writeClient(dir: string): Promise<string[]> {
  // It empties the folder first, so it only takes one named `client`.
  if (basename(dir) !== "client") throw new Error(`not a client folder: ${dir}`);
  rmSync(dir, { recursive: true, force: true });
  const written: string[] = [];
  for (const file of await buildClient()) {
    const path = join(dir, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.body);
    written.push(path);
  }
  return written;
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (dir === undefined) {
    console.error("usage: bun packages/ui/scripts/write-client.ts <dir>");
    process.exit(2);
  }
  for (const path of await writeClient(resolve(dir))) console.log(`[client] wrote ${path}`);
}
