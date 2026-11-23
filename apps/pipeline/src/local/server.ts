/**
 * The local adapter for bd-pipeline (ADR 0018): a SQLite file, an
 * in-process timer and Bun's HTTP server, around the same app core that
 * runs on Cloudflare. No wrangler, miniflare or workerd.
 */
import { Database as SQLite } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createPipeline, type Pipeline, pipelineConfig } from "../core/app.ts";
import { sqliteDatabase } from "./database.ts";
import { migrate } from "./migrate.ts";

export interface LocalPipelineOptions {
  /** Where the database lives. Created if missing. */
  dataDir: string;
  /** 0 picks a free port. */
  port: number;
  /** Localhost only unless the owner says otherwise (ADR 0011). */
  hostname?: string;
  /** Seconds between ticks. The runner decides whether a slot is due. */
  tickSeconds: number;
  /** PROBE_TOKEN, as on Cloudflare. */
  vars: Record<string, string | undefined>;
  log?: (line: string) => void;
}

export interface LocalPipeline {
  url: string;
  pipeline: Pipeline;
  /** Resolves when no tick is running. */
  idle(): Promise<void>;
  /** Waits for a running tick, then closes the server and the database. */
  stop(): Promise<void>;
}

export function startPipeline(options: LocalPipelineOptions): LocalPipeline {
  const log = options.log ?? ((line: string) => console.log(line));
  mkdirSync(options.dataDir, { recursive: true });
  const sqlite = new SQLite(join(options.dataDir, "content.db"), { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA busy_timeout = 5000");
  const ran = migrate(sqlite);
  if (ran.length > 0) log(`[pipeline] applied migrations: ${ran.join(", ")}`);

  const pipeline = createPipeline(
    { db: sqliteDatabase(sqlite), clock: { now: () => Date.now() } },
    pipelineConfig({ PROBE_TOKEN: options.vars.PROBE_TOKEN }),
  );

  const server = Bun.serve({
    port: options.port,
    hostname: options.hostname ?? "127.0.0.1",
    fetch: (request) => pipeline.fetch(request),
  });

  // One tick at a time in this process; the runner's lease covers the rest.
  let current: Promise<void> | null = null;
  const tick = () => {
    if (current) return;
    current = (async () => {
      try {
        log(`[pipeline] tick ${JSON.stringify(await pipeline.tick())}`);
      } catch (err) {
        log(`[pipeline] tick failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        current = null;
      }
    })();
  };
  tick();
  const timer = setInterval(tick, options.tickSeconds * 1000);

  return {
    url: `http://${server.hostname}:${server.port}`,
    pipeline,
    async idle() {
      await current;
    },
    async stop() {
      clearInterval(timer);
      await current;
      await server.stop();
      sqlite.close();
    },
  };
}
