/**
 * `bun run local`, or the `breaker-delta` executable: Breaker Delta on this
 * machine, with no cloud account and no Cloudflare tooling (ADR 0018). One
 * process runs the pipeline (SQLite file, timer) and the site.
 *
 * Build the executable: `bun run build:local` (see package.json).
 *
 * Environment:
 *   BD_DATA_DIR       where the data lives (default .bd-data in the current folder)
 *   BD_PORT           pipeline port (default 8787)
 *   BD_WEB_PORT       site port (default 8788)
 *   BD_TICK_SECONDS   seconds between ticks (default 60)
 *   BD_SOURCES        live (default): scan fetches the real sources;
 *                     fixtures: each group's recorded fixture, no network
 *   PROBE_TOKEN       as on Cloudflare
 *   MODEL_DRIVER      as on Cloudflare: unset = no model, fake = the fake driver
 *   READ_SOURCE, FIXTURE_SET            what the site reads (see apps/web)
 */
import { resolve } from "node:path";
import { startPipeline } from "@bd/pipeline/local";
import { startSite } from "@bd/web/local";

const env = process.env;
// The current folder, not this file's: in the executable, files live in a
// virtual filesystem.
const dataDir = resolve(env.BD_DATA_DIR ?? ".bd-data");

const sources = env.BD_SOURCES ?? "live";
if (sources !== "live" && sources !== "fixtures") {
  console.error(`[local] BD_SOURCES must be "live" or "fixtures", not "${sources}"`);
  process.exit(2);
}

// The site first: the pipeline's first tick runs at start and its publish
// step purges the site's cache in process.
const site = startSite({
  port: Number(env.BD_WEB_PORT ?? 8788),
  vars: { READ_SOURCE: env.READ_SOURCE, FIXTURE_SET: env.FIXTURE_SET },
});
const pipeline = startPipeline({
  dataDir,
  port: Number(env.BD_PORT ?? 8787),
  tickSeconds: Number(env.BD_TICK_SECONDS ?? 60),
  vars: { PROBE_TOKEN: env.PROBE_TOKEN, MODEL_DRIVER: env.MODEL_DRIVER },
  sources,
  site,
});

console.log(`[local] pipeline ${pipeline.url}, site ${site.url}, data in ${dataDir}`);
console.log("[local] Ctrl+C to stop.");

let stopping = false;
async function stop() {
  // A second Ctrl+C while a tick is still finishing exits at once.
  if (stopping) process.exit(1);
  stopping = true;
  console.log("[local] stopping after the current tick (Ctrl+C again to force)");
  // The pipeline first: a tick that is finishing may still purge the site.
  await pipeline.stop();
  await site.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
