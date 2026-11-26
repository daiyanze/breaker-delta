/**
 * Smoke test for the Cloudflare adapter (#173), run by CI after
 * `wrangler deploy --dry-run` has built bd-pipeline. It loads the built
 * Worker into the Workers runtime (miniflare, no account) and checks:
 *
 *   1. the D1 Database adapter passes the same port checks as bun:sqlite,
 *      and the R2 Blobs adapter the same checks as a directory;
 *   2. the cron handler runs the whole run, publish's RPC to bd-web
 *      included, and a slot runs once; and a preview, which binds no site,
 *      finishes its runs too;
 *   3. the built bd-web answers its front page with 200 and its heading,
 *      and `client/ui.css` is in its static assets (wrangler's build
 *      command writes it, #270).
 *
 * Cloudflare tooling stays out of `bun test` (ADR 0018): only this script,
 * in its own CI job, needs miniflare.
 *
 * Usage: bun scripts/cloudflare-smoke.ts <built pipeline dir> [<built web dir>]
 * The web dir defaults to `web` next to the pipeline dir.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { convertV4MiniflareOptions, Miniflare, Response as MiniflareResponse } from "miniflare";
import { d1Database } from "../apps/pipeline/src/cloudflare/d1.ts";
import { r2Blobs } from "../apps/pipeline/src/cloudflare/r2.ts";
import { blobsChecks, databaseChecks } from "../packages/ports/src/conformance.ts";

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

// 1. D1 against the Database port checks, R2 against the Blobs port checks.
// One empty database or bucket per check.
let conformance: Miniflare | null = null;
let next = 0;
const d1Checks = databaseChecks(async () => {
  if (!conformance) throw new Error("miniflare not started");
  return d1Database(await conformance.getD1Database(`C${next++}`));
});
let nextBucket = 0;
const r2Checks = blobsChecks(async () => {
  if (!conformance) throw new Error("miniflare not started");
  // Miniflare types the bucket with undici's Headers, not the Workers' own;
  // the object is the runtime's R2 binding either way.
  const bucket = await conformance.getR2Bucket(`B${nextBucket++}`);
  return r2Blobs(bucket as unknown as R2Bucket);
});
// Miniflare 5 nests worker options under `config`; convertV4MiniflareOptions
// accepts the flat v4 shape, which is the documented one.
conformance = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } };",
    compatibilityDate: "2026-11-01",
    d1Databases: d1Checks.map((_, i) => `C${i}`),
    r2Buckets: r2Checks.map((_, i) => `B${i}`),
  }),
);
for (const [label, checks] of [
  ["D1", d1Checks],
  ["R2", r2Checks],
] as const) {
  for (const check of checks) {
    try {
      await check.run();
      record(`${label}: ${check.name}`, true);
    } catch (err) {
      record(`${label}: ${check.name}`, false, err instanceof Error ? err.message : String(err));
    }
  }
}
await conformance.dispose();

// 2. The built Worker: migrations, cron, a slot runs once, the whole run.
// Bindings, vars and the compatibility date come from wrangler.jsonc, so the
// test fails if the config and the Worker drift apart. Twice: as deployed,
// with bd-web behind the `SITE` service binding, so the publish step's RPC to
// `SiteCacheEntrypoint` really runs (#36); and as a preview, with the
// `previews` bindings and no `SITE`, which must still finish its runs.
// Outbound fetches answer 404 (not retried): the scan step tries every
// source and reaches none, so nothing real is fetched in CI.
interface ServiceConfig {
  binding: string;
  service: string;
  entrypoint?: string;
}
interface Bindings {
  d1_databases?: { binding: string }[];
  r2_buckets?: { binding: string }[];
  services?: ServiceConfig[];
  vars?: Record<string, string>;
}
interface WranglerConfig extends Bindings {
  name: string;
  compatibility_date: string;
  previews?: Bindings;
}
const readConfig = (app: string) =>
  JSON.parse(
    readFileSync(join(root, "apps", app, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""),
  ) as WranglerConfig;
const config = readConfig("pipeline");
const webConfig = readConfig("web");
const webDir = resolve(process.argv[3] ?? join(outDir, "..", "web"));
const webScript = readdirSync(webDir).find((f) => f.endsWith(".js"));
if (!webScript) throw new Error(`no built bd-web worker in ${webDir}`);

async function smoke(label: string, bindings: Bindings) {
  const services = bindings.services ?? [];
  const pipelineWorker = {
    name: config.name,
    modules: true,
    modulesRoot: outDir,
    scriptPath: join(outDir, script as string),
    compatibilityDate: config.compatibility_date,
    d1Databases: (bindings.d1_databases ?? []).map((d) => d.binding),
    r2Buckets: (bindings.r2_buckets ?? []).map((r) => r.binding),
    bindings: { ...bindings.vars, PROBE_TOKEN: "smoke" },
    serviceBindings: Object.fromEntries(
      services.map((s) => [
        s.binding,
        { name: s.service, ...(s.entrypoint ? { entrypoint: s.entrypoint } : {}) },
      ]),
    ),
    outboundService: () => new MiniflareResponse("no network in the smoke test", { status: 404 }),
  };
  const webWorker = {
    name: webConfig.name,
    modules: true,
    modulesRoot: webDir,
    scriptPath: join(webDir, webScript as string),
    compatibilityDate: webConfig.compatibility_date,
  };
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: services.length > 0 ? [pipelineWorker, webWorker] : [pipelineWorker],
    }),
  );
  try {
    const db = await mf.getD1Database("DB", config.name);
    const migrations = join(root, "packages", "db", "migrations");
    const files = readdirSync(migrations).filter((f) => f.endsWith(".sql"));
    for (const file of files.sort()) {
      for (const sql of statements(readFileSync(join(migrations, file), "utf8"))) {
        await db.prepare(sql).run();
      }
    }

    const worker = await mf.getWorker(config.name);
    type Health = { lastRun: { slot: string; status: string } | null };
    async function health(): Promise<Health> {
      const res = await worker.fetch("http://bd.test/health");
      return (await res.json()) as Health;
    }

    record(`${label}: the Worker serves /health`, (await health()).lastRun === null);

    const first = await worker.scheduled({ cron: "*/15 * * * *" });
    const afterFirst = await health();
    record(
      `${label}: the cron handler runs the step runner`,
      first.outcome === "ok" && afterFirst.lastRun?.status === "done",
      JSON.stringify({ outcome: first.outcome, lastRun: afterFirst.lastRun }),
    );

    const steps = await db
      .prepare("SELECT step, status, output FROM run_steps ORDER BY finished_at, step")
      .all<{ step: string; status: string; output: string | null }>();
    const names = steps.results.map((r) => r.step);
    record(
      `${label}: every step ran and finished, publish and retention included`,
      ["scan", "compute", "publish", "retention"].every((n) => names.includes(n)) &&
        steps.results.every((r) => r.status === "done"),
      JSON.stringify(steps.results.map((r) => `${r.step}:${r.status}`)),
    );
    const publish = steps.results.find((r) => r.step === "publish");
    record(
      `${label}: publish ${services.length > 0 ? "reached bd-web over RPC" : "purged nothing, no SITE"}`,
      publish?.status === "done" && publish.output === '{"topics":0,"purged":0}',
      publish ? `${publish.status} ${publish.output}` : "no publish row",
    );

    // A second cron event and a manual tick must leave the run untouched.
    const snapshot = async () => {
      const runRows = await db.prepare("SELECT * FROM runs").all();
      const stepRows = await db.prepare("SELECT * FROM run_steps").all();
      return JSON.stringify([runRows.results, stepRows.results]);
    };
    const before = await snapshot();
    await worker.scheduled({ cron: "*/15 * * * *" });
    const tick = await worker.fetch("http://bd.test/__tick", {
      headers: { authorization: "Bearer smoke" },
    });
    const second = (await tick.json()) as { started: boolean; reason?: string };
    const unchanged = (await snapshot()) === before;
    const note = `tick ${JSON.stringify(second)}, runs and run_steps unchanged: ${unchanged}`;
    record(`${label}: a slot runs once`, second.started === false && unchanged, note);
  } catch (err) {
    record(
      `${label}: smoke test ran to the end`,
      false,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    await mf.dispose();
  }
}

await smoke("deployed", config);
await smoke("preview", config.previews ?? {});

// 3. The built bd-web (#270): its front page renders in the Workers runtime,
// and wrangler's build command wrote the client files into its static
// assets, which the Worker's pages link (`/client/ui.css`).
interface WebConfig {
  assets?: { directory: string };
}
async function webSmoke() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: webConfig.name,
      modules: true,
      modulesRoot: webDir,
      scriptPath: join(webDir, webScript as string),
      compatibilityDate: webConfig.compatibility_date,
    }),
  );
  try {
    const res = await (await mf.getWorker(webConfig.name)).fetch("http://bd.test/");
    const body = await res.text();
    record(
      "bd-web: the front page answers 200 with its heading",
      res.status === 200 && body.includes("<h1>Breaker Delta</h1>"),
      `${res.status}`,
    );
  } catch (err) {
    record(
      "bd-web: the front page renders",
      false,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    await mf.dispose();
  }
  const assets = (webConfig as WranglerConfig & WebConfig).assets?.directory;
  const css = assets ? join(root, "apps", "web", assets, "client", "ui.css") : null;
  const text = css && existsSync(css) ? readFileSync(css, "utf8") : null;
  record(
    "bd-web: client/ui.css is in the built assets",
    text?.includes("@layer tokens, base, primitives, patterns;") === true,
    css ?? "no assets directory in wrangler.jsonc",
  );
}
await webSmoke();

const summary = failures.length === 0 ? "all checks passed" : `${failures.length} failed`;
console.log(`[cloudflare] ${summary}`);
process.exit(failures.length === 0 ? 0 : 1);
