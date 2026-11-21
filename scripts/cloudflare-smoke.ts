/**
 * Smoke test for the Cloudflare adapter (#173), run by CI after
 * `wrangler deploy --dry-run` has built bd-pipeline. It loads the built
 * Worker into the Workers runtime (miniflare, no account) and checks:
 *
 *   1. the D1 Database adapter passes the same port checks as bun:sqlite;
 *   2. the cron handler runs the step runner, and a slot runs once.
 *
 * Cloudflare tooling stays out of `bun test` (ADR 0018): only this script,
 * in its own CI job, needs miniflare.
 *
 * Usage: bun scripts/cloudflare-smoke.ts <dir with the built worker>
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Miniflare } from "miniflare";
import { d1Database } from "../apps/pipeline/src/cloudflare/d1.ts";
import { databaseChecks } from "../packages/ports/src/conformance.ts";

const root = join(import.meta.dir, "..");
const outDir = resolve(process.argv[2] ?? join(root, ".wrangler-dist", "pipeline"));
const script = readdirSync(outDir).find((f) => f.endsWith(".js"));
if (!script) throw new Error(`no built worker in ${outDir}`);

const failures: string[] = [];
function record(name: string, ok: boolean, note = "") {
  console.log(`[cloudflare] ${ok ? "PASS" : "FAIL"} ${name}${note ? `: ${note}` : ""}`);
  if (!ok) failures.push(name);
}

/** Split a migration file into statements; D1 runs one statement at a time. */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// 1. D1 against the Database port checks. One empty database per check.
let conformance: Miniflare | null = null;
let next = 0;
const d1Checks = databaseChecks(async () => {
  if (!conformance) throw new Error("miniflare not started");
  return d1Database(await conformance.getD1Database(`C${next++}`));
});
conformance = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok'); } };",
  compatibilityDate: "2026-11-01",
  d1Databases: d1Checks.map((_, i) => `C${i}`),
});
for (const check of d1Checks) {
  try {
    await check.run();
    record(`D1: ${check.name}`, true);
  } catch (err) {
    record(`D1: ${check.name}`, false, err instanceof Error ? err.message : String(err));
  }
}
await conformance.dispose();

// 2. The built Worker: migrations, cron, a slot runs once.
const mf = new Miniflare({
  modules: true,
  modulesRoot: outDir,
  scriptPath: join(outDir, script),
  compatibilityDate: "2026-11-01",
  d1Databases: ["DB"],
  r2Buckets: ["BLOBS"],
  bindings: { RUN_INTERVAL_MINUTES: "60", PROBE_TOKEN: "smoke" },
});
try {
  const db = await mf.getD1Database("DB");
  const migrations = join(root, "packages", "db", "migrations");
  const files = readdirSync(migrations).filter((f) => f.endsWith(".sql"));
  for (const file of files.sort()) {
    for (const sql of statements(readFileSync(join(migrations, file), "utf8"))) {
      await db.prepare(sql).run();
    }
  }

  const worker = await mf.getWorker();
  type Health = { lastRun: { slot: string; status: string } | null };
  async function health(): Promise<Health> {
    const res = await worker.fetch("http://bd.test/health");
    return (await res.json()) as Health;
  }

  record("the Worker serves /health", (await health()).lastRun === null);

  const first = await worker.scheduled({ cron: "*/15 * * * *" });
  const afterFirst = await health();
  record(
    "the cron handler runs the step runner",
    first.outcome === "ok" && afterFirst.lastRun?.status === "done",
    JSON.stringify({ outcome: first.outcome, lastRun: afterFirst.lastRun }),
  );

  await worker.scheduled({ cron: "*/15 * * * *" });
  const tick = await worker.fetch("http://bd.test/__tick", {
    headers: { authorization: "Bearer smoke" },
  });
  const rows = await db.prepare("SELECT slot FROM runs").all();
  const second = (await tick.json()) as { started: boolean };
  const once = rows.results.length === 1 && second.started === false;
  record("a slot runs once", once, `${rows.results.length} run(s)`);
} catch (err) {
  record("smoke test ran to the end", false, err instanceof Error ? err.message : String(err));
} finally {
  await mf.dispose();
}

const summary = failures.length === 0 ? "all checks passed" : `${failures.length} failed`;
console.log(`[cloudflare] ${summary}`);
process.exit(failures.length === 0 ? 0 : 1);
