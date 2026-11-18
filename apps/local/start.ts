/**
 * Local launcher (spike 1 in docs/spikes/m0.md). UNVERIFIED: written without
 * being run. It should:
 *   1. apply migrations to a local SQLite database under .bd-data/
 *   2. run the pipeline Worker in the local Workers runtime, no account
 *   3. call the scheduled handler on an interval, standing in for cron
 *
 * Usage: bun run local
 */
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const pipeline = join(root, "apps", "pipeline");
const dataDir = join(root, ".bd-data");
const port = Number(process.env.BD_PORT ?? 8787);
const tickSeconds = Number(process.env.BD_TICK_SECONDS ?? 60);

async function run(cmd: string[]): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd: pipeline, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited with ${code}`);
}

const devVars = join(pipeline, ".dev.vars");
if (!existsSync(devVars)) await copyFile(join(pipeline, ".dev.vars.example"), devVars);

await run(["bunx", "wrangler", "d1", "migrations", "apply", "bd-content", "--local", "--persist-to", dataDir]);

const dev = Bun.spawn(
  ["bunx", "wrangler", "dev", "--local", "--test-scheduled", "--persist-to", dataDir, "--port", String(port)],
  { cwd: pipeline, stdout: "inherit", stderr: "inherit" },
);

const base = `http://127.0.0.1:${port}`;

async function waitUntilUp(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(1000);
  }
  throw new Error("pipeline did not start within 60s");
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

process.on("SIGINT", () => {
  clearInterval(timer);
  dev.kill();
  process.exit(0);
});
await dev.exited;
