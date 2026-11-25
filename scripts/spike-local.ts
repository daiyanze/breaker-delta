/**
 * Spike 1 (docs/spikes/m0.md): runs `bun run local` the way a user would and
 * checks the pass criteria that a script can check. CI runs it on Linux
 * (with no network), macOS and Windows.
 *
 * Usage: bun scripts/spike-local.ts
 * With BD_EXECUTABLE=<path>, it runs the built executable instead of
 * `apps/local/start.ts`: from a fresh folder outside the repository, with
 * no `bun` on PATH, as a user who downloaded one file would.
 * Last, it checks one full run (#40): the same launcher on a fresh data
 * folder with fixture sources and the fake model, which must fill echoes,
 * topics, wave points and events (`local-full-run.ts`).
 * Prints one line per criterion and exits non-zero if any fails.
 */
import { Database as SQLite } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fullRun, fullRunProblem } from "./local-full-run.ts";

const root = join(import.meta.dir, "..");
const port = Number(process.env.BD_PORT ?? 8799);
const base = `http://127.0.0.1:${port}`;
const webPort = Number(process.env.BD_WEB_PORT ?? 8798);
const dataDir = mkdtempSync(join(tmpdir(), "bd-spike-"));
const token = "spike";

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

const executable = process.env.BD_EXECUTABLE ? resolve(process.env.BD_EXECUTABLE) : null;
const workDir = mkdtempSync(join(tmpdir(), "bd-user-"));
/** PATH without any folder that holds Bun, so the executable cannot lean on it. */
const pathWithoutBun = (process.env.PATH ?? "")
  .split(delimiter)
  .filter((p) => !/bun/i.test(p))
  .join(delimiter);

function startLauncher() {
  const command = executable
    ? [executable]
    : [process.execPath, join(root, "apps", "local", "start.ts")];
  return Bun.spawn(command, {
    cwd: executable ? workDir : root,
    env: {
      ...process.env,
      ...(executable ? { PATH: pathWithoutBun } : {}),
      BD_PORT: String(port),
      BD_WEB_PORT: String(webPort),
      BD_DATA_DIR: dataDir,
      // One tick at start-up only; the spike calls the handler itself.
      BD_TICK_SECONDS: "3600",
      PROBE_TOKEN: token,
    },
    stdout: "inherit",
    stderr: "inherit",
  });
}

async function stopLauncher(proc: ReturnType<typeof startLauncher>) {
  if (process.platform === "win32") {
    // Kill the whole process tree.
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

/** Read the runs table straight from the SQLite file the launcher wrote. */
type StoredRun = { slot: string; started_at: number };

async function runsInDatabase(): Promise<StoredRun[]> {
  const db = new SQLite(join(dataDir, "content.db"), { readonly: true });
  try {
    return db.query("SELECT slot, started_at FROM runs ORDER BY started_at").all() as StoredRun[];
  } finally {
    db.close();
  }
}

let launcher = startLauncher();
try {
  const up = await waitFor(180, health);
  const how = executable ? "the executable, outside the repo, no bun on PATH" : "bun run local";
  record("starts with one command, no login", up !== null, up ? `${how} is up` : "no answer");
  if (executable) {
    const bun = Bun.which("bun", { PATH: pathWithoutBun });
    record("the executable runs with no bun on PATH", bun === null, bun ?? "bun not found");
  }
  record("/health answers", up?.ok === true, JSON.stringify(up));
  const site = await fetch(`http://127.0.0.1:${webPort}/health`).catch(() => null);
  record("the site answers", site?.ok === true, site ? `status ${site.status}` : "no answer");
  if (up === null) throw new Error("not up");

  // The launcher's first tick calls the scheduled handler (/__scheduled).
  const done = await waitFor(90, async () => {
    const h = await health();
    return h?.lastRun?.status === "done" ? h.lastRun : null;
  });
  record(
    "the scheduled handler runs the slot and it completes",
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
    // A file may still be held on Windows; the temp dir is cleaned by the OS.
  }
}

// One full run on fixtures with the fake model, after the launcher above has
// stopped. It uses its own data folder and free ports.
try {
  const command = executable
    ? [executable]
    : [process.execPath, join(root, "apps", "local", "start.ts")];
  const full = await fullRun({
    command,
    cwd: executable ? workDir : root,
    ...(executable ? { env: { PATH: pathWithoutBun } } : {}),
  });
  const problem = fullRunProblem(full);
  record(
    "one full run on fixtures with the fake model fills the database",
    problem === null,
    problem ?? `${full.steps.length} steps done, ${JSON.stringify(full.counts)}`,
  );
} catch (err) {
  record("full run ran to the end", false, err instanceof Error ? err.message : String(err));
}

const failed = results.filter((r) => !r.ok);
const passed = results.length - failed.length;
console.log(`\n[spike] ${process.platform}: ${passed}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
