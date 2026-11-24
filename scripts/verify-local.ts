/**
 * Drive local mode the way a user does and keep the evidence. The harness
 * behind `docs/verify-local/README.md`; read that first.
 *
 *   bun scripts/verify-local.ts up [--fixtures <set>]   start an isolated instance
 *   bun scripts/verify-local.ts doctor                  is it worth driving?
 *   bun scripts/verify-local.ts tick                    run the current slot now
 *   bun scripts/verify-local.ts get <path> [--pipeline] GET a page or API route
 *   bun scripts/verify-local.ts sql "<select>"          read the database, read-only
 *   bun scripts/verify-local.ts down                    stop it, keep the evidence
 *
 * Each `up` makes a run folder `.verify/<run>/`: the instance's data, its log,
 * every response saved by `tick`, `get` and `sql`, and `steps.tsv`, one row per
 * command. `down` stops the process it started and deletes the data folder;
 * everything else stays. Only one instance runs at a time.
 *
 * `get` prints a page only when the instance reads fixtures: a page built
 * from real scans holds fetched text, which must not reach a coding session
 * (invariant 6). The file is saved either way.
 */
import { Database as SQLite } from "bun:sqlite";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const verifyDir = join(root, ".verify");
const statePath = join(verifyDir, "current.json");
const TOKEN = "verify-local";

export interface State {
  pid: number;
  runDir: string;
  dataDir: string;
  pipelineUrl: string;
  siteUrl: string;
  fixtures: string | null;
  saved: number;
}

/** The launcher's start-up line: `[local] pipeline <url>, site <url>, data in <dir>`. */
export function parseStartLine(log: string): { pipelineUrl: string; siteUrl: string } | null {
  const m = log.match(/\[local\] pipeline (http:\/\/\S+), site (http:\/\/\S+), data in /);
  return m?.[1] && m[2] ? { pipelineUrl: m[1], siteUrl: m[2] } : null;
}

/** A file name for a saved response: counter plus a readable slug of what was asked. */
export function evidenceName(n: number, what: string, ext: string): string {
  const slug = what
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${String(n).padStart(2, "0")}-${slug || "root"}.${ext}`;
}

function readState(): State | null {
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf8")) as State;
}

async function writeState(state: State) {
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function step(state: State, command: string, result: string, evidence: string) {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ");
  const row = [new Date().toISOString(), command, result, evidence].map(clean).join("\t");
  appendFileSync(join(state.runDir, "steps.tsv"), `${row}\n`);
}

async function save(state: State, what: string, ext: string, body: string): Promise<string> {
  state.saved += 1;
  const file = join(state.runDir, evidenceName(state.saved, what, ext));
  await writeFile(file, body);
  await writeState(state);
  return file;
}

async function reachable(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/health`)).ok;
  } catch {
    return false;
  }
}

/**
 * The saved pid is ours only while that instance's pipeline still answers:
 * after a crash or a reboot the pid may belong to another process.
 */
async function ours(state: State): Promise<boolean> {
  return alive(state.pid) && (await reachable(state.pipelineUrl));
}

/** Fixture sets are the folders under `packages/fixtures/sets`. */
export function fixtureSets(dir = join(root, "packages", "fixtures", "sets")): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function need(): State {
  const state = readState();
  if (state === null) throw new Error("no instance: run `bun scripts/verify-local.ts up` first");
  return state;
}

async function up(args: string[]) {
  const running = readState();
  if (running !== null && (await ours(running))) {
    throw new Error(`an instance is already running (pid ${running.pid}); run \`down\` first`);
  }
  // A state file whose instance is gone is stale: drop it and its data folder,
  // keep the rest of its run folder.
  if (running !== null) {
    rmSync(running.dataDir, { recursive: true, force: true });
    rmSync(statePath, { force: true });
  }
  const at = args.indexOf("--fixtures");
  const fixtures = at === -1 ? null : (args[at + 1] ?? "busy");
  if (fixtures !== null && !fixtureSets().includes(fixtures)) {
    throw new Error(`unknown fixture set "${fixtures}"; sets: ${fixtureSets().join(", ")}`);
  }
  const runDir = join(verifyDir, new Date().toISOString().replace(/[:.]/g, "-"));
  const dataDir = join(runDir, "data");
  mkdirSync(dataDir, { recursive: true });
  const logPath = join(runDir, "instance.log");
  const log = openSync(logPath, "w");
  // Its own session, so it outlives this command and the agent's shell.
  const options = {
    cwd: root,
    env: {
      ...process.env,
      BD_DATA_DIR: dataDir,
      BD_PORT: "0",
      BD_WEB_PORT: "0",
      // One tick at start-up; later runs are started with `tick`.
      BD_TICK_SECONDS: "86400",
      PROBE_TOKEN: TOKEN,
      // Recorded fixture sources and the fake model: driving an instance
      // fetches nothing real and calls no provider (invariant 6), offline.
      BD_SOURCES: "fixtures",
      MODEL_DRIVER: "fake",
      ...(fixtures ? { READ_SOURCE: "fixtures", FIXTURE_SET: fixtures } : {}),
    },
    stdin: "ignore" as const,
    stdout: log,
    stderr: log,
    detached: true,
  };
  const proc = Bun.spawn([process.execPath, join(root, "apps", "local", "start.ts")], options);
  proc.unref();

  let urls: ReturnType<typeof parseStartLine> = null;
  for (let i = 0; i < 120 && urls === null; i++) {
    await Bun.sleep(500);
    if (!alive(proc.pid)) break;
    urls = parseStartLine(readFileSync(logPath, "utf8"));
  }
  if (urls === null) {
    throw new Error(`the instance did not start; see ${logPath}`);
  }
  const state: State = { pid: proc.pid, runDir, dataDir, fixtures, saved: 0, ...urls };
  await writeState(state);
  const ready = (await reachable(urls.pipelineUrl)) && (await reachable(urls.siteUrl));
  const asked = fixtures ? `up --fixtures ${fixtures}` : "up";
  step(state, asked, ready ? "ready" : "not ready", logPath);
  console.log(JSON.stringify({ ready, ...state }, null, 2));
  if (!ready) throw new Error(`started but /health does not answer; see ${logPath}`);
}

async function doctor() {
  const state = need();
  const db = join(state.dataDir, "content.db");
  let migrated = false;
  if (existsSync(db)) {
    const sqlite = new SQLite(db, { readonly: true });
    try {
      migrated = sqlite.query("SELECT name FROM sqlite_master WHERE name = 'runs'").get() !== null;
    } finally {
      sqlite.close();
    }
  }
  const checks = {
    process: alive(state.pid),
    pipeline: await reachable(state.pipelineUrl),
    site: await reachable(state.siteUrl),
    database: migrated,
  };
  const ok = Object.values(checks).every(Boolean);
  step(state, "doctor", ok ? "ok" : JSON.stringify(checks), "-");
  console.log(JSON.stringify({ ok, ...checks, runDir: state.runDir }, null, 2));
  if (!ok) throw new Error("doctor found a problem: see above, then `down` and `up` again");
}

async function tick() {
  const state = need();
  const res = await fetch(`${state.pipelineUrl}/__tick`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.text();
  const file = await save(state, "tick", "json", body);
  step(state, "tick", `${res.status} ${body}`, file);
  console.log(`${res.status} ${body}\nsaved ${file}`);
}

async function get(args: string[]) {
  const state = need();
  const path = args.find((a) => !a.startsWith("--")) ?? "/";
  const base = args.includes("--pipeline") ? state.pipelineUrl : state.siteUrl;
  const res = await fetch(new URL(path, base));
  const body = await res.text();
  const type = res.headers.get("content-type") ?? "";
  const ext = type.includes("html") ? "html" : type.includes("json") ? "json" : "txt";
  const file = await save(state, path, ext, body);
  const asked = `get ${path}${base === state.pipelineUrl ? " --pipeline" : ""}`;
  step(state, asked, String(res.status), file);
  const show = state.fixtures !== null || base === state.pipelineUrl;
  console.log(`${res.status} ${type}\nsaved ${file}${show ? `\n\n${preview(body)}` : ""}`);
}

/**
 * What `get` prints of a response: the first 2000 characters of an HTML
 * page's `<body>`, since `<head>` holds inline styles that would fill the
 * limit on their own; other bodies from the start. The full response is in
 * the saved file.
 */
export function preview(body: string, limit = 2000): string {
  const at = body.search(/<body[\s>]/i);
  return body.slice(at === -1 ? 0 : at, (at === -1 ? 0 : at) + limit);
}

async function sql(args: string[]) {
  const state = need();
  const query = args.join(" ").trim();
  if (query === "") throw new Error('usage: sql "SELECT ..."');
  const sqlite = new SQLite(join(state.dataDir, "content.db"), { readonly: true });
  try {
    const rows = sqlite.query(query).all();
    const body = `${JSON.stringify({ query, rows }, null, 2)}\n`;
    const file = await save(state, "sql", "json", body);
    step(state, `sql ${query}`, `${rows.length} rows`, file);
    console.log(`${body}saved ${file}`);
  } finally {
    sqlite.close();
  }
}

async function down() {
  const state = readState();
  if (state === null) {
    console.log("nothing running");
    return;
  }
  const mine = await ours(state);
  if (mine) {
    if (process.platform === "win32") {
      await Bun.spawn(["taskkill", "/pid", String(state.pid), "/T", "/F"]).exited;
    } else {
      process.kill(state.pid, "SIGTERM");
    }
    for (let i = 0; i < 30 && alive(state.pid); i++) await Bun.sleep(500);
    if (alive(state.pid)) process.kill(state.pid, "SIGKILL");
  }
  rmSync(state.dataDir, { recursive: true, force: true });
  rmSync(statePath, { force: true });
  const what = mine ? `stopped pid ${state.pid}` : "instance already gone, nothing stopped";
  step(state, "down", `${what}, data removed`, state.runDir);
  console.log(`${what}; evidence kept in ${state.runDir}`);
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  mkdirSync(verifyDir, { recursive: true });
  const commands: Record<string, (args: string[]) => Promise<void>> = {
    up,
    doctor,
    tick,
    get,
    sql,
    down,
  };
  const run = command ? commands[command] : undefined;
  if (run === undefined) {
    console.error("usage: bun scripts/verify-local.ts up|doctor|tick|get|sql|down");
    process.exit(2);
  }
  try {
    await run(args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A failed command is a step too, when there is an instance to log it in.
    const state = readState();
    if (state !== null) step(state, [command, ...args].join(" "), `failed: ${message}`, "-");
    console.error(`[verify-local] ${message}`);
    process.exit(1);
  }
}
