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
 *   REPORT_TOKEN      as on Cloudflare: guards /__report (#53); unset = no report
 *   MODEL_DRIVER      as on Cloudflare: unset = the provider chains from settings, fake = the fake driver
 *   BD_BRIDGE_COMMAND the agent CLI the model bridge runs, as a JSON array (bridge.ts); unset = no bridge
 *   BD_BRIDGE_PORT    bridge port, on 127.0.0.1 only (default 8789)
 *   BD_BRIDGE_TIMEOUT_SECONDS  a bridge call running longer is killed (default 120)
 *   BD_BRIDGE_ENV     more variable names the agent gets, comma-separated (bridge.ts `AGENT_ENV`)
 *   READ_SOURCE, FIXTURE_SET            what the site reads (see apps/web)
 */
import { resolve } from "node:path";
import { startPipeline } from "@bd/pipeline/local";
import { startSite } from "@bd/web/local";
import { agentEnv, type Bridge, bridgeConfig, isClaudeCommand, startBridge } from "./bridge.ts";

const env = process.env;
// The current folder, not this file's: in the executable, files live in a
// virtual filesystem.
const dataDir = resolve(env.BD_DATA_DIR ?? ".bd-data");

const sources = env.BD_SOURCES ?? "live";
if (sources !== "live" && sources !== "fixtures") {
  console.error(`[local] BD_SOURCES must be "live" or "fixtures", not "${sources}"`);
  process.exit(2);
}

// The model bridge first, so the first tick can reach it (docs/providers.md,
// "Local bridge"). It runs only when a command is configured; a value it
// cannot use stops the launcher before anything starts.
let bridge: Bridge | null = null;
let config: ReturnType<typeof bridgeConfig>;
let agentVars: Record<string, string> = {};
try {
  config = bridgeConfig(env);
  if (config) agentVars = agentEnv(env, config.passEnv);
} catch (err) {
  console.error(`[local] not starting: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}
if (config) {
  if (!isClaudeCommand(config.command)) {
    console.warn(
      "[local] the bridge cannot check that this command runs without tools; make sure it does",
    );
  }
  bridge = startBridge({
    command: config.command,
    port: config.port,
    timeoutMs: config.timeoutMs,
    env: agentVars,
  });
  console.log(`[local] model bridge ${bridge.url}/v1 (a provider's baseUrl in settings)`);
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
  vars: {
    PROBE_TOKEN: env.PROBE_TOKEN,
    REPORT_TOKEN: env.REPORT_TOKEN,
    MODEL_DRIVER: env.MODEL_DRIVER,
  },
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
  await bridge?.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
