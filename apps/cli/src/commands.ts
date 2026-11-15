// The five commands. Human output mirrors the Python entry points
// line for line where a Python counterpart exists (radar/__main__.py
// for scan/review, radar/publish.py's build output for publish);
// record and doctor are new in Phase 4 and define their own formats.
//
// Exit codes (handled in cli.ts): 0 ok, 1 runtime error, 2 usage.

import * as fs from "node:fs";
import * as path from "node:path";

import {
  dueForReview,
  loadStore,
  recordReview,
  saveStore,
  todayLocal,
  upsertTopic,
} from "@breaker-delta/core";
import type { TopicStore } from "@breaker-delta/core";
import { runScan, summaryLines } from "@breaker-delta/fetchers";
import { buildSite, optionsFromEnv } from "@breaker-delta/publisher";
import type { BuildOptions } from "@breaker-delta/publisher";

import {
  findConfigFile,
  loadCliConfig,
  resolveConfigDir,
  statePath,
  type CliContext,
} from "./context.js";

export class UsageError extends Error {}
export class RuntimeError extends Error {}

function out(ctx: CliContext, line: string): void {
  process.stdout.write(line + "\n");
}

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

// ------------------------------------------------------------ scan

export function autoEdition(now: Date = new Date()): string {
  return now.getHours() < 12 ? "morning" : "evening";
}

export async function cmdScan(ctx: CliContext, editionArg?: string): Promise<number> {
  const edition = editionArg ?? autoEdition();
  const { config } = loadCliConfig(ctx);
  const report = await runScan(edition, config, {
    baseDir: ctx.dataDir,
    stateDir: path.join(ctx.dataDir, "state"),
    env: process.env,
  });
  if (ctx.json) {
    printJson(report);
    return 0;
  }
  for (const line of summaryLines(report)) out(ctx, line);
  out(ctx, `候选文件：${report._file}`);
  out(ctx, "下一步：把候选文件和 skills/breaker-delta/SKILL.md 交给你的 agent 出报告。");
  return 0;
}

// ------------------------------------------------------------ review

export function cmdReview(ctx: CliContext): number {
  const store = loadStore(statePath(ctx));
  const due = dueForReview(store);
  if (ctx.json) {
    printJson(due);
    return 0;
  }
  if (due.length === 0) {
    out(ctx, "No topics due for review.");
    return 0;
  }
  for (const topic of due) {
    out(ctx, `- ${topic.name} (first seen ${topic.first_seen}, sources: ${topic.sources.join(", ")})`);
  }
  return 0;
}

// ------------------------------------------------------------ record

export interface RecordEntry {
  name: string;
  sources: string[];
  grade: string;
}

function validateEntries(data: unknown): RecordEntry[] {
  if (!Array.isArray(data)) {
    throw new RuntimeError("record: input must be a JSON array of {name, sources, grade}");
  }
  return data.map((raw, i) => {
    const e = raw as Record<string, unknown>;
    if (typeof e?.name !== "string" || e.name === "") {
      throw new RuntimeError(`record: entry ${i}: name must be a non-empty string`);
    }
    if (!Array.isArray(e.sources) || e.sources.some((s) => typeof s !== "string")) {
      throw new RuntimeError(`record: entry ${i}: sources must be an array of strings`);
    }
    if (typeof e.grade !== "string" || e.grade === "") {
      throw new RuntimeError(`record: entry ${i}: grade must be a non-empty string`);
    }
    return { name: e.name, sources: e.sources as string[], grade: e.grade };
  });
}

async function readAllStdin(): Promise<string> {
  const chunks: string[] = [];
  process.stdin.setEncoding("utf-8");
  await new Promise<void>((resolve) => {
    process.stdin.on("data", (chunk: string) => {
      chunks.push(chunk);
    });
    process.stdin.on("end", () => resolve());
  });
  return chunks.join("");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function checkDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new UsageError(`invalid --date (want YYYY-MM-DD): ${value}`);
  }
  return value;
}

export async function cmdRecord(
  ctx: CliContext,
  file: string,
  dateArg?: string,
): Promise<number> {
  const date = checkDate(dateArg);
  const text = file === "-" ? await readAllStdin() : fs.readFileSync(file, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new RuntimeError(`record: invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const entries = validateEntries(parsed);
  const storePath = statePath(ctx);
  const store: TopicStore = loadStore(storePath);
  let created = 0;
  let updated = 0;
  const lines: string[] = [];
  for (const entry of entries) {
    const existed = store.topics.some((t) => t.name === entry.name);
    upsertTopic(store, entry.name, entry.sources, entry.grade, date);
    if (existed) {
      updated += 1;
      lines.push(`updated: ${entry.name}`);
    } else {
      created += 1;
      lines.push(`created: ${entry.name}`);
    }
  }
  saveStore(store, storePath);
  if (ctx.json) {
    printJson({ created, updated, total: store.topics.length });
    return 0;
  }
  for (const line of lines) out(ctx, line);
  out(ctx, `topics total: ${store.topics.length}`);
  return 0;
}

export function cmdRecordReview(
  ctx: CliContext,
  name: string | undefined,
  result: string | undefined,
): number {
  if (!name) throw new UsageError("record review: --name is required");
  if (!result) throw new UsageError("record review: --result hit|miss is required");
  const storePath = statePath(ctx);
  const store = loadStore(storePath);
  let topic;
  try {
    topic = recordReview(store, name, result);
  } catch (err) {
    throw new RuntimeError(err instanceof Error ? err.message : String(err));
  }
  saveStore(store, storePath);
  if (ctx.json) {
    printJson({ name, result, checked_on: topic.review?.checked_on ?? todayLocal() });
    return 0;
  }
  out(ctx, `recorded review: ${name} -> ${result}`);
  return 0;
}

// ------------------------------------------------------------ publish

export interface PublishFlags {
  out?: string;
  baseUrl?: string;
  dataRepo?: string;
  langs?: string;
  creator?: boolean;
}

const DEFAULT_BASE_URL = "https://daiyanze.github.io/breaker-delta/"; // publisher's DEFAULT_BASE_URL

async function withLogsToStderr<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.log;
  console.log = (...args: unknown[]) => console.error(...args);
  try {
    return await fn();
  } finally {
    console.log = orig;
  }
}

export async function cmdPublish(ctx: CliContext, flags: PublishFlags): Promise<number> {
  const envOpts = optionsFromEnv(process.env, ctx.rootDir);
  const trackRecord = path.join(ctx.dataDir, "track-record.md");
  const opts: BuildOptions = {
    ...envOpts,
    rootDir: ctx.rootDir,
    editionsDir: path.join(ctx.dataDir, "editions"),
    ledgerPath: statePath(ctx),
    trackRecordPath: fs.existsSync(trackRecord) ? trackRecord : null,
    configDir: resolveConfigDir(ctx),
    faviconCacheDir: path.join(ctx.rootDir, "favicon-cache"),
    outDir: path.resolve(flags.out ?? envOpts.outDir ?? path.join(ctx.dataDir, "site")),
  };
  if (flags.baseUrl !== undefined) opts.baseUrl = flags.baseUrl;
  if (flags.dataRepo !== undefined) opts.dataRepo = flags.dataRepo;
  if (flags.langs !== undefined) {
    opts.langs = flags.langs.split(",").map((x) => x.trim()).filter((x) => x !== "");
  }
  if (flags.creator !== undefined) opts.creator = flags.creator;
  const written = ctx.json
    ? await withLogsToStderr(() => buildSite(opts))
    : await buildSite(opts);
  if (ctx.json) {
    printJson({
      outDir: opts.outDir,
      baseUrl: flags.baseUrl ?? envOpts.baseUrl ?? DEFAULT_BASE_URL,
      pages: written.length,
    });
  }
  return 0;
}

// ------------------------------------------------------------ doctor

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function collectDoctorChecks(ctx: CliContext): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const major = Number(process.version.replace(/^v/, "").split(".")[0]);
  checks.push({
    name: "node",
    status: major >= 20 ? "ok" : "fail",
    detail: `${process.version} (need >= 20)`,
  });
  checks.push({
    name: "data-dir",
    status: isDir(ctx.dataDir) ? "ok" : "fail",
    detail: ctx.dataDir,
  });
  const configFile = findConfigFile(ctx);
  if (!configFile) {
    checks.push({ name: "config", status: "fail", detail: "no config file found in data dir or engine root" });
  } else {
    try {
      loadCliConfig(ctx);
      checks.push({ name: "config", status: "ok", detail: configFile });
    } catch (err) {
      checks.push({
        name: "config",
        status: "fail",
        detail: `${configFile}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  const editionsDir = path.join(ctx.dataDir, "editions");
  if (!isDir(editionsDir)) {
    checks.push({ name: "editions", status: "fail", detail: "editions/ missing" });
  } else {
    const count = fs.readdirSync(editionsDir).filter((f) => f.endsWith(".json")).length;
    checks.push({ name: "editions", status: "ok", detail: `${count} edition files` });
  }
  const stateDir = path.join(ctx.dataDir, "state");
  if (!isDir(stateDir)) {
    checks.push({ name: "state", status: "warn", detail: "state/ missing (created on first scan/record)" });
  } else {
    try {
      fs.accessSync(stateDir, 2); // W_OK
      checks.push({ name: "state", status: "ok", detail: "state/ writable" });
    } catch {
      checks.push({ name: "state", status: "fail", detail: "state/ not writable" });
    }
  }
  const storeFile = statePath(ctx);
  if (!fs.existsSync(storeFile)) {
    checks.push({ name: "seen-topics", status: "warn", detail: "seen-topics.json not present yet (empty store)" });
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(storeFile, "utf-8")) as TopicStore;
      checks.push({ name: "seen-topics", status: "ok", detail: `${(data.topics ?? []).length} topics` });
    } catch (err) {
      checks.push({
        name: "seen-topics",
        status: "fail",
        detail: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  checks.push({
    name: "track-record",
    status: fs.existsSync(path.join(ctx.dataDir, "track-record.md")) ? "ok" : "warn",
    detail: fs.existsSync(path.join(ctx.dataDir, "track-record.md"))
      ? "track-record.md present"
      : "track-record.md missing (track-record page will be empty)",
  });
  checks.push({
    name: "assets",
    status: isDir(path.join(ctx.rootDir, "assets")) ? "ok" : "fail",
    detail: path.join(ctx.rootDir, "assets"),
  });
  checks.push({
    name: "favicon-cache",
    status: isDir(path.join(ctx.rootDir, "favicon-cache")) ? "ok" : "fail",
    detail: path.join(ctx.rootDir, "favicon-cache"),
  });
  return checks;
}

export function cmdDoctor(ctx: CliContext): number {
  const checks = collectDoctorChecks(ctx);
  const fails = checks.filter((c) => c.status === "fail").length;
  if (ctx.json) {
    printJson({ ok: fails === 0, dataDir: ctx.dataDir, rootDir: ctx.rootDir, checks });
    return fails === 0 ? 0 : 1;
  }
  for (const check of checks) {
    out(ctx, `${check.status.padEnd(4)} ${check.name}: ${check.detail}`);
  }
  const warns = checks.filter((c) => c.status === "warn").length;
  const oks = checks.filter((c) => c.status === "ok").length;
  out(ctx, `doctor: ${oks} ok, ${warns} warn, ${fails} fail`);
  return fails === 0 ? 0 : 1;
}
