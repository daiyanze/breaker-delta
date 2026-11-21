/**
 * Local launcher (spike 1 in docs/spikes/m0.md). It:
 *   1. applies migrations to a local SQLite database under .bd-data/
 *   2. runs the pipeline Worker in the local Workers runtime, no account
 *   3. calls the scheduled handler on an interval, standing in for cron
 *
 * Interim: this goes through wrangler. ADR 0018 replaces it with a native
 * Bun runtime shipped as one executable.
 *
 * Usage: bun run local
 * Environment: BD_PORT (8787), BD_TICK_SECONDS (60), BD_DATA_DIR (.bd-data).
 */
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = join(import.meta.dir, "..", "..");
const pipeline = join(root, "apps", "pipeline");
const dataDir = resolve(process.env.BD_DATA_DIR ?? join(root, ".bd-data"));
const port = Number(process.env.BD_PORT ?? 8787);
const tickSeconds = Number(process.env.BD_TICK_SECONDS ?? 60);

/** `bun x wrangler ...` with the wrangler in node_modules; works where `bunx` is not on PATH. */
const wrangler = (args: string[]) => [process.execPath, "x", "wrangler", ...args];

async function run(cmd: string[]): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd: pipeline, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited with ${code}`);
}

const devVars = join(pipeline, ".dev.vars");
if (!existsSync(devVars)) await copyFile(join(pipeline, ".dev.vars.example"), devVars);

const migrate = ["d1", "migrations", "apply", "bd-content", "--local", "--persist-to", dataDir];
await run(wrangler(migrate));

const dev = Bun.spawn(
  wrangler([
    "dev",
    "--local",
    "--test-scheduled",
    "--persist-to",
    dataDir,
    "--port",
    String(port),
    "--ip",
    "127.0.0.1",
  ]),
  { cwd: pipeline, stdout: "inherit", stderr: "inherit" },
);

const base = `http://127.0.0.1:${port}`;

async function waitUntilUp(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(1000);
  }
  throw new Error("pipeline did not start within 120s");
}

async function tick(): Promise<void> {
  try {
    await fetch(`${base}/__scheduled?cron=*/15+*+*+*+*`);
    const health = (await (await fetch(`${base}/health`)).json()) as unknown;
    console.log(`[local] tick ${new Date().toISOString()}`, JSON.stringify(health));
  } catch (err) {
    console.error("[local] tick failed:", err instanceof Error ? err.message : err);
  }
}

await waitUntilUp();
console.log(`[local] pipeline is up at ${base}. Data in ${dataDir}. Ctrl+C to stop.`);
await tick();
const timer = setInterval(tick, tickSeconds * 1000);

function stop() {
  clearInterval(timer);
  dev.kill();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await dev.exited;
