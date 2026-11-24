/**
 * One full local run end to end (#40): starts the real launcher (`bun run
 * local`, or the built executable) on a fresh data folder with fixture
 * sources and the fake model, waits until its start-up tick has finished,
 * stops it, and reads what the run left in `content.db`.
 *
 * Fixture sources fetch nothing and the fake model calls no provider, so this
 * runs offline and no fetched text reaches the caller (invariant 6). It
 * returns counts and statuses only.
 *
 * Used by `local-full-run.test.ts` (in `bun run check`, with `bun run
 * local`) and by `spike-local.ts` (in `spike-local.yml`, with `bun run local`
 * and with the executable, on Linux, macOS and Windows).
 */
import { Database as SQLite } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The tables the acceptance criterion names (#40). */
export const FULL_RUN_TABLES = ["echoes", "topics", "wave_points", "events"] as const;
export type FullRunTable = (typeof FULL_RUN_TABLES)[number];

export interface FullRunOptions {
  /** The launcher command, e.g. `[process.execPath, "apps/local/start.ts"]` or `[exe]`. */
  command: string[];
  cwd: string;
  /** Extra environment (e.g. a PATH without Bun for the executable). */
  env?: Record<string, string>;
  /** Seconds to wait for the launcher and for its first run. */
  timeoutSeconds?: number;
}

export interface FullRunResult {
  /** The first run's status, or null if none finished in time. */
  status: string | null;
  /** Step name and status, in run order. */
  steps: { step: string; status: string }[];
  counts: Record<FullRunTable, number>;
  /** Event type to count. */
  events: Record<string, number>;
}

interface Health {
  ok: boolean;
  lastRun: { slot: string; status: string } | null;
}

async function stop(proc: ReturnType<typeof Bun.spawn>) {
  if (process.platform === "win32") {
    await Bun.spawn(["taskkill", "/pid", String(proc.pid), "/T", "/F"]).exited;
  } else {
    proc.kill("SIGINT");
  }
  await Promise.race([proc.exited, Bun.sleep(15_000)]);
}

/** Reads the launcher's stdout until it prints the pipeline URL; keeps draining after. */
async function pipelineUrl(stdout: ReadableStream<Uint8Array>, output: string[]) {
  const decoder = new TextDecoder();
  let resolveUrl: (url: string | null) => void = () => {};
  const url = new Promise<string | null>((r) => {
    resolveUrl = r;
  });
  (async () => {
    let buffered = "";
    for await (const chunk of stdout) {
      buffered += decoder.decode(chunk, { stream: true });
      const match = /\[local\] pipeline (http:\/\/\S+?),/.exec(buffered);
      if (match?.[1]) resolveUrl(match[1]);
    }
    output.push(buffered);
    resolveUrl(null);
  })();
  return url;
}

export async function fullRun(options: FullRunOptions): Promise<FullRunResult> {
  const timeout = options.timeoutSeconds ?? 120;
  const dataDir = mkdtempSync(join(tmpdir(), "bd-full-run-"));
  const output: string[] = [];
  const proc = Bun.spawn(options.command, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
      // Port 0: the launcher picks free ports and prints the URLs.
      BD_PORT: "0",
      BD_WEB_PORT: "0",
      BD_DATA_DIR: dataDir,
      // The start-up tick only.
      BD_TICK_SECONDS: "3600",
      BD_SOURCES: "fixtures",
      MODEL_DRIVER: "fake",
    },
    stdout: "pipe",
    stderr: "inherit",
  });
  let status: string | null = null;
  try {
    const url = await Promise.race([
      pipelineUrl(proc.stdout, output),
      Bun.sleep(timeout * 1000).then(() => null),
    ]);
    if (url === null) throw new Error(`the launcher printed no pipeline URL: ${output.join("")}`);
    for (let i = 0; i < timeout && status === null; i++) {
      const health = (await fetch(`${url}/health`)
        .then((r) => r.json())
        .catch(() => null)) as Health | null;
      const run = health?.lastRun;
      if (run && run.status !== "running") status = run.status;
      else await Bun.sleep(1000);
    }
  } finally {
    await stop(proc);
  }

  const db = new SQLite(join(dataDir, "content.db"), { readonly: true });
  try {
    const count = (table: FullRunTable) =>
      (db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    const counts = Object.fromEntries(FULL_RUN_TABLES.map((t) => [t, count(t)])) as Record<
      FullRunTable,
      number
    >;
    const steps = db
      .query("SELECT step, status FROM run_steps ORDER BY rowid")
      .all() as FullRunResult["steps"];
    const events = Object.fromEntries(
      (
        db.query("SELECT type, COUNT(*) AS n FROM events GROUP BY type").all() as {
          type: string;
          n: number;
        }[]
      ).map((r) => [r.type, r.n]),
    );
    return { status, steps, counts, events };
  } finally {
    db.close();
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // A file may still be held on Windows; the temp dir is cleaned by the OS.
    }
  }
}

/** Why a result is not one full run, or null when it is. */
export function fullRunProblem(result: FullRunResult): string | null {
  if (result.status !== "done") return `run status ${result.status ?? "none"}, not done`;
  const notDone = result.steps.filter((s) => s.status !== "done");
  if (result.steps.length === 0 || notDone.length > 0) {
    return `steps not done: ${JSON.stringify(result.steps)}`;
  }
  const empty = FULL_RUN_TABLES.filter((t) => result.counts[t] === 0);
  if (empty.length > 0) return `no rows in ${empty.join(", ")}`;
  return null;
}
