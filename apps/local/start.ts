/**
 * `bun run local`: Breaker Delta on this machine, with no cloud account and
 * no Cloudflare tooling (ADR 0018). One process runs the pipeline (SQLite
 * file, timer) and the site.
 *
 * Environment:
 *   BD_DATA_DIR       where the data lives (default .bd-data)
 *   BD_PORT           pipeline port (default 8787)
 *   BD_WEB_PORT       site port (default 8788)
 *   BD_TICK_SECONDS   seconds between ticks (default 60)
 *   RUN_INTERVAL_MINUTES, PROBE_TOKEN   as on Cloudflare
 *   READ_SOURCE, FIXTURE_SET            what the site reads (see apps/web)
 */
import { join, resolve } from "node:path";
import { startPipeline } from "@bd/pipeline/local";
import { startSite } from "@bd/web/local";

const env = process.env;
const root = join(import.meta.dir, "..", "..");
const dataDir = resolve(env.BD_DATA_DIR ?? join(root, ".bd-data"));

const pipeline = startPipeline({
  dataDir,
  port: Number(env.BD_PORT ?? 8787),
  tickSeconds: Number(env.BD_TICK_SECONDS ?? 60),
  vars: { RUN_INTERVAL_MINUTES: env.RUN_INTERVAL_MINUTES, PROBE_TOKEN: env.PROBE_TOKEN },
});
const site = startSite({
  port: Number(env.BD_WEB_PORT ?? 8788),
  vars: { READ_SOURCE: env.READ_SOURCE, FIXTURE_SET: env.FIXTURE_SET },
});

console.log(`[local] pipeline ${pipeline.url}, site ${site.url}, data in ${dataDir}`);
console.log("[local] Ctrl+C to stop.");

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await site.stop();
  await pipeline.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
