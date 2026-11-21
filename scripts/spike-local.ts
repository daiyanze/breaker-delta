/**
 * Spike 1 (docs/spikes/m0.md): runs `bun run local` the way a user would and
 * checks the pass criteria that a script can check. CI runs it on Linux
 * (with no network), macOS and Windows.
 *
 * Usage: bun scripts/spike-local.ts
 * Prints one line per criterion and exits non-zero if any fails.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const port = Number(process.env.BD_PORT ?? 8799);
const base = `http://127.0.0.1:${port}`;
const dataDir = mkdtempSync(join(tmpdir(), "bd-spike-"));
const token = "dev"; // PROBE_TOKEN from apps/pipeline/.dev.vars.example

interface LastRun {
  slot: string;
  status: string;
  started_at: number;
  finished_at: number | null;
}

const results: { name: string; ok: boolean; note: string }[] = [];
function record(name: string, ok: boolean, note: string) {
  results.push({ name, ok, note });
  console.log(`[spike] ${ok ? "PASS" : "FAIL"} ${name}: ${note}`);
}

function startLauncher() {
  return Bun.spawn([process.execPath, join(root, "apps", "local", "start.ts")], {
    cwd: root,
    env: {
      ...process.env,
      BD_PORT: String(port),
      BD_DATA_DIR: dataDir,
      // One tick at start-up only; the spike calls the handler itself.
      BD_TICK_SECONDS: "3600",
      WRANGLER_SEND_METRICS: "false",
    },
    stdout: "inherit",
    stderr: "inherit",
  });
}

async function stopLauncher(proc: ReturnType<typeof startLauncher>) {
  if (process.platform === "win32") {
    // Kill the whole tree: launcher, wrangler and workerd.
    await Bun.spawn(["taskkill", "/pid", String(proc.pid), "/T", "/F"]).exited;
  } else {
    proc.kill("SIGINT");
  }
  await Promise.race([proc.exited, Bun.sleep(15_000)]);
  // Wait until the port is free so the restart binds cleanly.
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`${base}/health`);
      await Bun.sleep(1000);
    } catch {
      return;
    }
  }
}

async function health(): Promise<{ ok: boolean; lastRun: LastRun | null } | null> {
  try {
    const res = await fetch(`${base}/health`);
    return res.ok ? ((await res.json()) as { ok: boolean; lastRun: LastRun | null }) : null;
  } catch {
    return null;
  }
}

async function waitFor<T>(seconds: number, probe: () => Promise<T | null>): Promise<T | null> {
  for (let i = 0; i < seconds; i++) {
    const value = await probe();
    if (value !== null) return value;
    await Bun.sleep(1000);
  }
  return null;
}

async function manualTick(): Promise<{ slot: string; started: boolean; reason?: string }> {
  const res = await fetch(`${base}/__tick`, { headers: { authorization: `Bearer ${token}` } });
  return (await res.json()) as { slot: string; started: boolean; reason?: string };
}

async function runsInDatabase(): Promise<{ slot: string; started_at: number }[]> {
  const sql = "SELECT slot, started_at FROM runs ORDER BY started_at";
  const args = ["d1", "execute", "bd-content", "--local", "--persist-to", dataDir, "--json"];
  const proc = Bun.spawn([process.execPath, "x", "wrangler", ...args, "--command", sql], {
    cwd: join(root, "apps", "pipeline"),
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    stdout: "pipe",
    stderr: "inherit",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  const parsed = JSON.parse(out.slice(out.indexOf("["))) as { results: unknown[] }[];
  return (parsed[0]?.results ?? []) as { slot: string; started_at: number }[];
}

let launcher = startLauncher();
try {
  const up = await waitFor(180, health);
  record("starts with one command, no login", up !== null, up ? "launcher is up" : "no answer");
  record("/health answers", up?.ok === true, JSON.stringify(up));
  if (up === null) throw new Error("not up");

  // The launcher's first tick calls the scheduled handler (/__scheduled).
  const done = await waitFor(90, async () => {
    const h = await health();
    return h?.lastRun?.status === "done" ? h.lastRun : null;
  });
  record(
    "the scheduled handler creates a RunWorkflow instance and it completes",
    done !== null,
    done ? `slot ${done.slot} done` : "no completed run within 90s",
  );

  // Two more ticks: if a slot boundary passed, the first may start the new
  // slot; the second must not start anything.
  await manualTick();
  const second = await manualTick();
  record(
    "a second tick in the same slot does not create a second run",
    second.started === false,
    JSON.stringify(second),
  );

  const before = (await health())?.lastRun ?? null;
  await stopLauncher(launcher);
  launcher = startLauncher();
  const again = await waitFor(180, health);
  await stopLauncher(launcher);
  // Read the database file directly: the run from before the restart must be there.
  const rows = await runsInDatabase();
  const kept = rows.some((r) => r.slot === before?.slot && r.started_at === before?.started_at);
  record(
    "data survives a restart",
    again !== null && kept,
    `before ${JSON.stringify(before)}, rows after ${JSON.stringify(rows)}`,
  );
} catch (err) {
  record("spike ran to the end", false, err instanceof Error ? err.message : String(err));
} finally {
  await stopLauncher(launcher);
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // workerd may still hold a file on Windows; the temp dir is cleaned by the OS.
  }
}

const failed = results.filter((r) => !r.ok);
const passed = results.length - failed.length;
console.log(`\n[spike] ${process.platform}: ${passed}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
