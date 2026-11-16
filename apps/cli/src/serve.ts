// `serve` — the thin dynamic server for self-hosted instances (P1).
//
// Renders the whole site into memory with the publisher's
// renderSiteMap (the same templates as the static build), serves it
// over HTTP, and re-renders when the data dir changes. A small push
// API lets an external agent (the run Skill on the user's own agent
// host) deliver graded work: POST /api/record writes topics back to
// the store, POST /api/editions drops in a finished edition file.
// Both require the BD_PUSH_TOKEN bearer token; without a token the
// API is disabled and the server is read-only.
//
// An optional built-in scheduler (BD_SCAN_TIMES=06:00,18:00) runs
// the fetch layer on schedule; grading stays with the agent by
// default (the P1 division of labour) — with grading.auto set in
// the instance config, the built-in LLM grader (P1d, grade.ts)
// closes the loop instead.
//
// This layer is deliberately thin — it is the piece the P2
// Next.js/vinext migration replaces; all durable logic (fetch,
// grading rules, templates, store) lives in the packages below it.

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

import { catRulesFromConfig } from "@breaker-delta/core";
import { runScan, summaryLines } from "@breaker-delta/fetchers";
import { optionsFromEnv, renderSiteMap } from "@breaker-delta/publisher";
import type { BuildOptions } from "@breaker-delta/publisher";

import { applyRecord, autoEdition, validateEntries } from "./commands.js";
import { gradingConfigFrom, runGrade } from "./grade.js";
import {
  findConfigFile,
  loadCliConfig,
  resolveConfigDir,
  statePath,
  type CliContext,
} from "./context.js";
import { resolvePanelPlugins } from "./plugins.js";
import {
  fetcherModules,
  loadEnabledCodePlugins,
  runExitPass,
} from "./plugins-code.js";

export interface ServeFlags {
  port?: string;
  host?: string;
  baseUrl?: string;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

interface SiteState {
  map: Map<string, Uint8Array>;
  renderedAt: string;
}

function log(line: string): void {
  process.stdout.write(`[serve] ${line}\n`);
}

function buildOptions(ctx: CliContext, baseUrl: string): BuildOptions {
  const envOpts = optionsFromEnv(process.env, ctx.rootDir);
  const trackRecord = path.join(ctx.dataDir, "track-record.md");
  const opts: BuildOptions = {
    ...envOpts,
    rootDir: ctx.rootDir,
    editionsDir: path.join(ctx.dataDir, "editions"),
    ledgerPath: statePath(ctx),
    trackRecordPath: fs.existsSync(trackRecord) ? trackRecord : null,
    configDir: resolveConfigDir(ctx),
    // The favicon cache lives in the data dir: it is the writable,
    // persistent place in a container (the engine root is the image).
    faviconCacheDir: path.join(ctx.dataDir, "favicon-cache"),
    outDir: path.join(ctx.dataDir, "site"),
    baseUrl,
  };
  const cliConfig = loadCliConfig(ctx).config;
  const catRules = catRulesFromConfig(cliConfig);
  if (catRules) opts.catRules = catRules;
  opts.panelPlugins = resolvePanelPlugins(
    ctx,
    cliConfig as Record<string, unknown>,
    envOpts.creator ?? true,
  );
  return opts;
}

/** Fingerprint of everything a render depends on. */
function dataFingerprint(ctx: CliContext): string {
  const parts: string[] = [];
  const editionsDir = path.join(ctx.dataDir, "editions");
  try {
    for (const name of fs.readdirSync(editionsDir).sort()) {
      if (!name.endsWith(".json")) continue;
      const st = fs.statSync(path.join(editionsDir, name));
      parts.push(`${name}:${st.mtimeMs}:${st.size}`);
    }
  } catch {
    // no editions dir yet — the render reports it through loadEditions
  }
  for (const p of [statePath(ctx), path.join(ctx.dataDir, "track-record.md")]) {
    try {
      const st = fs.statSync(p);
      parts.push(`${path.basename(p)}:${st.mtimeMs}:${st.size}`);
    } catch {
      parts.push(`${path.basename(p)}:-`);
    }
  }
  const cfg = findConfigFile(ctx);
  if (cfg) {
    try {
      const st = fs.statSync(cfg);
      parts.push(`config:${st.mtimeMs}:${st.size}`);
    } catch {
      /* ignore */
    }
  }
  return parts.join("|");
}

function readBody(req: http.IncomingMessage, limit = 4_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    req.on("data", (chunk: Uint8Array) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error("request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const all = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        all.set(c, off);
        off += c.length;
      }
      resolve(new TextDecoder().decode(all));
    });
    req.on("error", reject);
  });
}

function jsonResponse(
  res: http.ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value, null, 2) + "\n";
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function cmdServe(ctx: CliContext, flags: ServeFlags): Promise<number> {
  const port = Number(flags.port ?? process.env.PORT ?? process.env.BD_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`serve: invalid port: ${flags.port ?? process.env.PORT ?? ""}`);
  }
  const host = flags.host ?? "0.0.0.0";
  const envBase = process.env.BD_BASE_URL;
  const baseUrl =
    flags.baseUrl ?? (envBase ? envBase : `http://localhost:${port}/`);
  const pushToken = process.env.BD_PUSH_TOKEN ?? "";
  const opts = buildOptions(ctx, baseUrl);

  let state: SiteState | null = null;
  let rendering: Promise<void> | null = null;
  let lastFingerprint = "";
  let lastError: string | null = null;

  async function render(reason: string): Promise<void> {
    if (rendering) return rendering;
    rendering = (async () => {
      // Fingerprint BEFORE the render: if the data changes again
      // while this render is in flight, the completion fingerprint
      // differs and a catch-up render is owed — otherwise a push
      // landing mid-render would be silently swallowed.
      const fp = dataFingerprint(ctx);
      try {
        const map = await renderSiteMap(opts);
        state = { map, renderedAt: new Date().toISOString() };
        lastFingerprint = fp;
        lastError = null;
        log(`rendered ${map.size} files (${reason})`);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        log(`render failed (${reason}): ${lastError}`);
      } finally {
        rendering = null;
      }
      if (dataFingerprint(ctx) !== lastFingerprint) {
        void render("catch-up");
      }
    })();
    return rendering;
  }

  // Start listening immediately; the first render (cold favicon
  // cache fetches can take seconds) completes in the background —
  // /api/health reports ok:false and pages 503 until it lands.
  void render("startup");

  // Watch for data changes (poll; robust on container volumes where
  // fs.watch is unreliable).
  const watchMs = Number(process.env.BD_WATCH_MS ?? 5000);
  if (watchMs > 0) {
    const timer = setInterval(() => {
      if (dataFingerprint(ctx) !== lastFingerprint) {
        void render("data changed");
      }
    }, watchMs);
    timer.unref();
  }

  // Optional built-in scan scheduler: BD_SCAN_TIMES=06:00,18:00 in
  // the container's local time (set TZ in the environment).
  const scanTimes = (process.env.BD_SCAN_TIMES ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^\d{2}:\d{2}$/.test(x));
  if (scanTimes.length > 0) {
    let lastRunKey = "";
    const timer = setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const key = `${now.toDateString()} ${hhmm}`;
      if (!scanTimes.includes(hhmm) || lastRunKey === key) return;
      lastRunKey = key;
      void (async () => {
        try {
          const { config } = loadCliConfig(ctx);
          const codePlugins = await loadEnabledCodePlugins(
            ctx,
            config as Record<string, unknown>,
            ["fetcher"],
          );
          const report = await runScan(autoEdition(now), config, {
            baseDir: ctx.dataDir,
            stateDir: path.join(ctx.dataDir, "state"),
            env: process.env,
            extraFetchers: fetcherModules(codePlugins),
          });
          for (const line of summaryLines(report)) log(line);
          // P1d: with grading.auto set, the built-in LLM grader
          // closes the loop (edition + ledger); the site re-render
          // picks the new edition up via the fingerprint poll.
          const grading = gradingConfigFrom(config as Record<string, unknown>);
          if (grading?.auto) {
            try {
              const loadedCfg = loadCliConfig(ctx);
              const res = await runGrade(
                ctx,
                config as Record<string, unknown>,
                loadedCfg.file,
                loadedCfg.preset,
                { slot: autoEdition(now) },
              );
              log(`auto-grade done (${res.model}): ${res.items} item(s) -> ${res.file}`);
            } catch (err) {
              log(`auto-grade failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          } else {
            log(`scan done; candidates at ${report._file} — grading is the agent's step (push the edition via /api/editions)`);
          }
        } catch (err) {
          log(`scan failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();
    }, 20_000);
    timer.unref();
    log(`scan scheduler on: ${scanTimes.join(", ")} (local time)`);
  }

  function authorized(req: http.IncomingMessage): boolean {
    if (pushToken === "") return false;
    const header = req.headers["authorization"];
    return header === `Bearer ${pushToken}`;
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://internal");
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === "/api/health") {
        jsonResponse(res, 200, {
          ok: state !== null,
          renderedAt: state?.renderedAt ?? null,
          files: state?.map.size ?? 0,
          pushApi: pushToken !== "",
          scheduler: scanTimes,
          error: lastError,
        });
        return;
      }

      if (pathname === "/api/record" || pathname === "/api/editions") {
        if (req.method !== "POST") {
          jsonResponse(res, 405, { error: "POST only" });
          return;
        }
        if (pushToken === "") {
          jsonResponse(res, 403, { error: "push API disabled (set BD_PUSH_TOKEN)" });
          return;
        }
        if (!authorized(req)) {
          jsonResponse(res, 401, { error: "bad or missing bearer token" });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(await readBody(req));
        } catch (err) {
          jsonResponse(res, 400, {
            error: `invalid JSON body: ${err instanceof Error ? err.message : String(err)}`,
          });
          return;
        }
        if (pathname === "/api/record") {
          try {
            const entries = validateEntries(parsed);
            const result = applyRecord(ctx, entries);
            void render("record pushed");
            jsonResponse(res, 200, result);
          } catch (err) {
            jsonResponse(res, 400, { error: err instanceof Error ? err.message : String(err) });
          }
          return;
        }
        // /api/editions: one finished edition object.
        const ed = parsed as { date?: unknown; slot?: unknown; items?: unknown };
        if (
          typeof ed?.date !== "string" ||
          !DATE_RE.test(ed.date) ||
          (ed.slot !== "morning" && ed.slot !== "evening") ||
          !Array.isArray(ed.items)
        ) {
          jsonResponse(res, 400, {
            error: "edition must be an object with date (YYYY-MM-DD), slot (morning|evening) and items[]",
          });
          return;
        }
        const editionsDir = path.join(ctx.dataDir, "editions");
        const file = path.join(editionsDir, `${ed.date}-${ed.slot}.json`);
        if (fs.existsSync(file) && url.searchParams.get("replace") !== "1") {
          jsonResponse(res, 409, {
            error: `${ed.date}-${ed.slot}.json already exists (append ?replace=1 to overwrite)`,
          });
          return;
        }
        fs.mkdirSync(editionsDir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(ed, null, 2) + "\n", "utf-8");
        void render("edition pushed");
        // Plugin-P1: a pushed edition is an ingestion event — fire
        // enabled exit plugins for exactly this file. Best-effort:
        // logged, never blocking or failing the push response.
        void (async () => {
          try {
            const { config } = loadCliConfig(ctx);
            const res2 = await runExitPass(ctx, config as Record<string, unknown>, editionsDir, {
              onlyFiles: [`${ed.date}-${ed.slot}.json`],
            });
            for (const f of res2.fired) log(`plugin exit: ${f.plugin} <- ${f.file}`);
            for (const e of res2.errors) log(`plugin exit error: ${e}`);
          } catch (err) {
            log(`plugin exit error: ${err instanceof Error ? err.message : String(err)}`);
          }
        })();
        jsonResponse(res, 200, { written: file, items: (ed.items as unknown[]).length });
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        jsonResponse(res, 405, { error: "GET only" });
        return;
      }
      if (!state) {
        res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
        res.end("rendering… try again in a moment\n");
        return;
      }
      let key = pathname.replace(/^\/+/, "");
      if (key === "" || key.endsWith("/")) key += "index.html";
      const bytes = state.map.get(key);
      if (!bytes) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found\n");
        return;
      }
      const ext = path.extname(key).toLowerCase();
      res.writeHead(200, {
        "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "cache-control": ext === ".html" ? "no-cache" : "public, max-age=3600",
        "content-length": String(bytes.length),
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    })().catch((err) => {
      log(`request failed: ${err instanceof Error ? err.message : String(err)}`);
      try {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("internal error\n");
      } catch {
        /* response already closed */
      }
    });
  });

  return await new Promise<number>((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      log(`listening on http://${host}:${addr?.port ?? port}/ (data dir: ${ctx.dataDir})`);
      log(
        pushToken !== ""
          ? "push API enabled (BD_PUSH_TOKEN set)"
          : "push API disabled (no BD_PUSH_TOKEN) — read-only server",
      );
    });
    process.on("SIGTERM", () => {
      server.close();
      resolve(0);
    });
    process.on("SIGINT", () => {
      server.close();
      resolve(0);
    });
  });
}
