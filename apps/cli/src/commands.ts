// The CLI commands. Human output mirrors the Python entry points
// line for line where a Python counterpart exists (radar/__main__.py
// for scan/review, radar/publish.py's build output for publish);
// record and doctor are new in Phase 4 and define their own formats.
//
// Exit codes (handled in cli.ts): 0 ok, 1 runtime error, 2 usage.

import * as fs from "node:fs";
import * as path from "node:path";

import {
  catRulesFromConfig,
  dueForReview,
  loadStore,
  recordReview,
  saveStore,
  todayLocal,
  upsertTopic,
} from "@breaker-delta/core";
import type { TopicStore } from "@breaker-delta/core";
import { loadConfig, runScan, summaryLines } from "@breaker-delta/fetchers";
import { buildDocsSite, buildSite, optionsFromEnv } from "@breaker-delta/publisher";
import type { BuildOptions } from "@breaker-delta/publisher";

import { collectPluginChecks, resolvePanelPlugins } from "./plugins.js";
import {
  entityPluginIds,
  fetcherModules,
  loadEnabledCodePlugins,
  runEntitiesPass,
  runExitPass,
  runPagePass,
  runReviewPass,
  runScorePass,
  scoreDescriptors,
} from "./plugins-code.js";

import {
  findConfigFile,
  findPresetConfigFile,
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
  // Plugin-P1: enabled fetcher plugins ride along as extra
  // fetcher modules under the same controls as built-in sources.
  const codePlugins = await loadEnabledCodePlugins(
    ctx,
    config as Record<string, unknown>,
    ["fetcher"],
  );
  const report = await runScan(edition, config, {
    baseDir: ctx.dataDir,
    stateDir: path.join(ctx.dataDir, "state"),
    env: process.env,
    extraFetchers: fetcherModules(codePlugins),
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

export function validateEntries(data: unknown): RecordEntry[] {
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
  const { created, updated, total, lines } = applyRecord(ctx, entries, date);
  if (ctx.json) {
    printJson({ created, updated, total });
    return 0;
  }
  for (const line of lines) out(ctx, line);
  out(ctx, `topics total: ${total}`);
  return 0;
}

/** The store write-back shared by `record` and the serve push API. */
export function applyRecord(
  ctx: CliContext,
  entries: RecordEntry[],
  date?: string,
): { created: number; updated: number; total: number; lines: string[] } {
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
  return { created, updated, total: store.topics.length, lines };
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
  // Category taxonomy comes from the effective config (preset base
  // layer merged with the instance config); absent = built-in default.
  const cliConfig = loadCliConfig(ctx).config;
  const catRules = catRulesFromConfig(cliConfig);
  if (catRules) opts.catRules = catRules;
  // Panel plugins (Plugin-P0): definitions discovered under the
  // engine root / data dir, enablement from the same merged config.
  opts.panelPlugins = resolvePanelPlugins(
    ctx,
    cliConfig as Record<string, unknown>,
    flags.creator ?? envOpts.creator ?? true,
  );
  // Plugin-P1 score pass: enabled score plugins compute their
  // sub-scores over the latest appearances and store them into
  // the edition items BEFORE the build, so the render (and every
  // other consumer of the edition files) sees them.
  const scoreRes = await runScorePass(
    ctx,
    cliConfig as Record<string, unknown>,
    opts.editionsDir ?? path.join(ctx.dataDir, "editions"),
  );
  if (scoreRes.plugins.length > 0) {
    const line =
      `plugin scores: ${scoreRes.plugins.join(", ")} — ` +
      `${scoreRes.scored} item(s) updated in ${scoreRes.filesWritten} edition file(s)`;
    if (ctx.json) console.error(line);
    else out(ctx, line);
  }
  opts.scorePlugins = scoreDescriptors(ctx, cliConfig as Record<string, unknown>);
  // Plugin-P2 entities pass: same idea — extraction results are
  // stored into the items before the build.
  const entRes = await runEntitiesPass(
    ctx,
    cliConfig as Record<string, unknown>,
    opts.editionsDir ?? path.join(ctx.dataDir, "editions"),
  );
  if (entRes.plugins.length > 0) {
    const line =
      `plugin entities: ${entRes.plugins.join(", ")} — ` +
      `${entRes.stamped} item(s) updated in ${entRes.filesWritten} edition file(s)`;
    if (ctx.json) console.error(line);
    else out(ctx, line);
  }
  opts.entityPlugins = entityPluginIds(ctx, cliConfig as Record<string, unknown>);
  // Plugin-P2 page pass: page plugins' block data lands in
  // state/plugin-pages/ for the build (and the web app) to render.
  const pageRes = await runPagePass(
    ctx,
    cliConfig as Record<string, unknown>,
    opts.editionsDir ?? path.join(ctx.dataDir, "editions"),
  );
  if (pageRes.pages.length > 0) {
    const line = `plugin pages: ${pageRes.pages.join(", ")}`;
    if (ctx.json) console.error(line);
    else out(ctx, line);
  }
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
  // Plugin-P1 exit pass: fire exit plugins for editions they have
  // not seen yet (per-plugin watermark under state/). Failures are
  // reported, never fatal — exit is a side channel.
  const exitRes = await runExitPass(
    ctx,
    cliConfig as Record<string, unknown>,
    opts.editionsDir ?? path.join(ctx.dataDir, "editions"),
  );
  for (const f of exitRes.fired) {
    const line = `plugin exit: ${f.plugin} <- ${f.file}`;
    if (ctx.json) console.error(line);
    else out(ctx, line);
  }
  for (const e of exitRes.errors) {
    console.error(`plugin exit error: ${e}`);
  }
  return 0;
}

// ------------------------------------------------------------ plugins (Plugin-P1 manual runs)

/** `plugins score` / `plugins exit`: run one pass by hand (the
 *  same passes publish runs automatically). Useful for instances
 *  whose editions arrive by git rather than by publish. */
export async function cmdPlugins(ctx: CliContext, sub: string | undefined): Promise<number> {
  const { config } = loadCliConfig(ctx);
  const cfg = config as Record<string, unknown>;
  const editionsDir = path.join(ctx.dataDir, "editions");
  if (sub === "score") {
    const res = await runScorePass(ctx, cfg, editionsDir);
    if (ctx.json) printJson(res);
    else if (res.plugins.length === 0) out(ctx, "no score plugins enabled");
    else {
      out(
        ctx,
        `plugin scores: ${res.plugins.join(", ")} — ${res.scored} item(s) updated in ${res.filesWritten} edition file(s)`,
      );
    }
    return 0;
  }
  if (sub === "exit") {
    const res = await runExitPass(ctx, cfg, editionsDir);
    if (ctx.json) printJson(res);
    else {
      if (res.fired.length === 0 && res.errors.length === 0) {
        out(ctx, "no exit plugins fired (none enabled, or no new editions)");
      }
      for (const f of res.fired) out(ctx, `plugin exit: ${f.plugin} <- ${f.file}`);
      for (const e of res.errors) out(ctx, `plugin exit error: ${e}`);
    }
    return res.errors.length > 0 ? 1 : 0;
  }
  if (sub === "entities") {
    const res = await runEntitiesPass(ctx, cfg, editionsDir);
    if (ctx.json) printJson(res);
    else if (res.plugins.length === 0) out(ctx, "no entity plugins enabled");
    else {
      out(
        ctx,
        `plugin entities: ${res.plugins.join(", ")} — ${res.stamped} item(s) updated in ${res.filesWritten} edition file(s)`,
      );
    }
    return 0;
  }
  if (sub === "review") {
    const res = await runReviewPass(ctx, cfg, editionsDir);
    if (ctx.json) printJson(res);
    else if (res.plugins.length === 0) out(ctx, "no review plugins enabled");
    else {
      out(ctx, `plugin review: ${res.due} due, ${res.checked.length} verdict(s) recorded`);
      for (const c of res.checked) {
        out(ctx, `  ${c.name} -> ${c.result} (via ${c.plugin}${c.evidence ? `: ${c.evidence}` : ""})`);
      }
    }
    return 0;
  }
  if (sub === "pages") {
    const res = await runPagePass(ctx, cfg, editionsDir);
    if (ctx.json) printJson(res);
    else if (res.pages.length === 0) out(ctx, "no page plugins enabled");
    else out(ctx, `plugin pages: ${res.pages.join(", ")}`);
    return 0;
  }
  throw new UsageError("plugins: expected a subcommand: score | exit | entities | review | pages");
}

// ------------------------------------------------------------ docs

export interface DocsFlags {
  out?: string;
  docsUrl?: string;
  mainUrl?: string;
  langs?: string;
}

const DEFAULT_DOCS_URL = "https://docs.breakerdelta.com/"; // publisher's DEFAULT_DOCS_URL

/** Build the standalone docs site (no data dir needed). */
export function cmdDocs(ctx: CliContext, flags: DocsFlags): number {
  const envOpts = optionsFromEnv(process.env, ctx.rootDir);
  const opts: BuildOptions = {
    rootDir: ctx.rootDir,
    outDir: path.resolve(flags.out ?? process.env.TS_DOCS_OUT ?? "docs-site"),
    docsUrl: flags.docsUrl ?? envOpts.docsUrl,
    mainUrl: flags.mainUrl ?? envOpts.mainUrl,
    langs: envOpts.langs,
  };
  if (flags.langs !== undefined) {
    opts.langs = flags.langs.split(",").map((x) => x.trim()).filter((x) => x !== "");
  }
  const written = buildDocsSite(opts);
  if (ctx.json) {
    printJson({
      outDir: opts.outDir,
      docsUrl: opts.docsUrl ?? DEFAULT_DOCS_URL,
      pages: written.length,
    });
  } else {
    out(ctx, `docs: ${written.length} pages -> ${opts.outDir}`);
  }
  return 0;
}

// ------------------------------------------------------------ preset

export interface PresetInfo {
  name: string;
  configFile: string | null;
  brief: boolean;
  /** Valid category rules in the preset config; null = config unreadable. */
  categories: number | null;
  /** Feed URLs declared across the preset's source groups. */
  feeds: number;
  /** True when the current instance config selects this preset. */
  selected: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Feed entries ({name, url}) an effective config declares, per source group. */
export function collectFeedProbes(
  config: unknown,
): { group: string; name: string; url: string }[] {
  const probes: { group: string; name: string; url: string }[] = [];
  if (!isRecord(config) || !isRecord(config["sources"])) return probes;
  for (const [group, section] of Object.entries(config["sources"])) {
    if (!isRecord(section) || section["enabled"] === false) continue;
    if (!Array.isArray(section["feeds"])) continue;
    for (const feed of section["feeds"]) {
      if (isRecord(feed) && typeof feed["url"] === "string" && feed["url"] !== "") {
        probes.push({
          group,
          name: typeof feed["name"] === "string" ? feed["name"] : feed["url"],
          url: feed["url"],
        });
      }
    }
  }
  return probes;
}

export function listPresets(ctx: CliContext): PresetInfo[] {
  const dir = path.join(ctx.rootDir, "presets");
  if (!isDir(dir)) return [];
  let selected: string | null = null;
  try {
    selected = loadCliConfig(ctx).preset;
  } catch {
    selected = null; // a broken instance config must not hide the catalog
  }
  return fs
    .readdirSync(dir)
    .filter((name) => isDir(path.join(dir, name)))
    .sort()
    .map((name) => {
      const configFile = findPresetConfigFile(ctx.rootDir, name);
      let categories: number | null = null;
      let feeds = 0;
      if (configFile) {
        try {
          const cfg: unknown = loadConfig(configFile);
          const rules = catRulesFromConfig(cfg);
          categories = rules ? rules.rules.length : 0;
          feeds = collectFeedProbes(cfg).length;
        } catch {
          categories = null;
        }
      }
      return {
        name,
        configFile,
        brief: fs.existsSync(path.join(dir, name, "brief.md")),
        categories,
        feeds,
        selected: selected === name,
      };
    });
}

export function cmdPresetList(ctx: CliContext): number {
  const presets = listPresets(ctx);
  if (ctx.json) {
    printJson({ presets });
    return 0;
  }
  if (presets.length === 0) {
    out(ctx, `no presets bundled under ${path.join(ctx.rootDir, "presets")}`);
    return 0;
  }
  for (const p of presets) {
    const bits: string[] = [];
    bits.push(p.categories === null ? "config unreadable" : `${p.categories} categories`);
    bits.push(`${p.feeds} feeds`);
    bits.push(p.brief ? "brief.md" : "no brief.md");
    out(ctx, `${p.name} — ${bits.join(", ")}${p.selected ? " (selected by this instance)" : ""}`);
  }
  return 0;
}

export function cmdPresetInit(ctx: CliContext, name: string | undefined): number {
  if (!name) {
    throw new UsageError("preset init: a preset name is required (see: preset list)");
  }
  const configFile = findPresetConfigFile(ctx.rootDir, name);
  if (!configFile) {
    const available = listPresets(ctx).map((p) => p.name);
    throw new UsageError(
      `preset init: unknown preset "${name}"` +
        (available.length > 0 ? ` (available: ${available.join(", ")})` : " (no presets bundled)"),
    );
  }
  const presetDir = path.join(ctx.rootDir, "presets", name);
  const copies: { from: string; to: string }[] = [
    { from: configFile, to: path.join(ctx.dataDir, path.basename(configFile)) },
  ];
  const briefFrom = path.join(presetDir, "brief.md");
  if (fs.existsSync(briefFrom)) {
    copies.push({ from: briefFrom, to: path.join(ctx.dataDir, "brief.md") });
  }
  for (const c of copies) {
    if (fs.existsSync(c.to)) {
      throw new RuntimeError(
        `preset init: ${c.to} already exists — refusing to overwrite. Edit it, or move it away and re-run.`,
      );
    }
  }
  fs.mkdirSync(ctx.dataDir, { recursive: true });
  for (const c of copies) fs.copyFileSync(c.from, c.to);
  if (ctx.json) {
    printJson({ preset: name, written: copies.map((c) => c.to) });
    return 0;
  }
  for (const c of copies) out(ctx, `wrote ${c.to}`);
  out(ctx, `preset "${name}" copied into the data dir — it is yours now: edit the copy, the bundled preset stays untouched.`);
  out(ctx, "next: breaker-delta doctor, then scan.");
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
  const bunVersion = process.versions.bun;
  if (bunVersion) {
    const [bMaj, bMin] = bunVersion.split(".").map((x) => Number(x));
    checks.push({
      name: "runtime",
      status: bMaj > 1 || (bMaj === 1 && bMin >= 2) ? "ok" : "fail",
      detail: `bun ${bunVersion} (need >= 1.2)`,
    });
  } else {
    const major = Number(process.version.replace(/^v/, "").split(".")[0]);
    checks.push({
      name: "runtime",
      status: major >= 20 ? "ok" : "fail",
      detail: `node ${process.version} (need >= 20; bun >= 1.2 preferred)`,
    });
  }
  checks.push({
    name: "data-dir",
    status: isDir(ctx.dataDir) ? "ok" : "fail",
    detail: ctx.dataDir,
  });
  const configFile = findConfigFile(ctx);
  let loadedConfig: unknown = null;
  let loadedPreset: string | null = null;
  if (!configFile) {
    checks.push({ name: "config", status: "fail", detail: "no config file found in data dir or engine root" });
  } else {
    try {
      const loaded = loadCliConfig(ctx);
      loadedConfig = loaded.config;
      loadedPreset = loaded.preset;
      checks.push({
        name: "config",
        status: "ok",
        detail: loaded.preset ? `${configFile} (preset: ${loaded.preset})` : configFile,
      });
    } catch (err) {
      checks.push({
        name: "config",
        status: "fail",
        detail: `${configFile}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  if (loadedConfig !== null) {
    // Taxonomy integrity: a categories section that parses to zero
    // valid rules would silently fall back to the built-in taxonomy
    // at publish time — that is a config bug, so it fails here.
    const section = isRecord(loadedConfig) ? loadedConfig["categories"] : undefined;
    if (section === undefined || section === null) {
      checks.push({
        name: "categories",
        status: "ok",
        detail: "built-in default taxonomy (no categories section in the effective config)",
      });
    } else {
      const rules = catRulesFromConfig(loadedConfig);
      checks.push(
        rules
          ? {
              name: "categories",
              status: "ok",
              detail:
                `${rules.rules.length} categories + fallback "${rules.fallback}"` +
                (loadedPreset ? ` (via preset: ${loadedPreset})` : ""),
            }
          : {
              name: "categories",
              status: "fail",
              detail:
                "categories section present but yields no valid rules — " +
                "publish would silently use the built-in taxonomy",
            },
      );
    }
  }
  if (loadedConfig !== null && isRecord(loadedConfig)) {
    // Plugin integrity (Plugin-P0): broken packs and config entries
    // enabling unknown plugins fail; enabled data plugins get their
    // schema validated so a bad pack surfaces here, not at publish.
    checks.push(...collectPluginChecks(ctx, loadedConfig));
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

const FEED_PROBE_SAMPLE = 3;
const FEED_PROBE_TIMEOUT_MS = 6000;

export type FetchFn = (url: string, init?: FetchInit) => Promise<FetchResponse>;

/**
 * Online spot-check (doctor --online): probe a sample of the feed
 * URLs the effective config declares, per source group. Only
 * config-declared feeds can be probed — code-defined sources (HN,
 * GitHub, …) have no URL in config and are skipped. A dead feed is
 * a warn, not a fail: feeds rot transiently, and dropping a source
 * is the setup wizard's call, not doctor's.
 */
export async function collectOnlineChecks(
  config: unknown,
  fetchFn: FetchFn = fetch,
): Promise<DoctorCheck[]> {
  const probes = collectFeedProbes(config);
  if (probes.length === 0) {
    return [
      {
        name: "feeds",
        status: "warn",
        detail: "no config-declared feeds to probe (code-defined sources are not probed)",
      },
    ];
  }
  const byGroup = new Map<string, { name: string; url: string }[]>();
  for (const p of probes) {
    const arr = byGroup.get(p.group) ?? [];
    arr.push(p);
    byGroup.set(p.group, arr);
  }
  const checks: DoctorCheck[] = [];
  await Promise.all(
    [...byGroup.entries()].map(async ([group, feeds]) => {
      const sample = feeds.slice(0, FEED_PROBE_SAMPLE);
      const dead: string[] = [];
      await Promise.all(
        sample.map(async (feed) => {
          try {
            const res = await fetchFn(feed.url, {
              redirect: "follow",
              signal: AbortSignal.timeout(FEED_PROBE_TIMEOUT_MS),
              headers: { "user-agent": "breaker-delta-doctor" },
            });
            if (res.status >= 400) dead.push(`${feed.name} (HTTP ${res.status})`);
            void res.body?.cancel().catch(() => {});
          } catch (err) {
            dead.push(`${feed.name} (${err instanceof Error ? err.name : "error"})`);
          }
        }),
      );
      checks.push({
        name: `feeds:${group}`,
        status: dead.length === 0 ? "ok" : "warn",
        detail:
          dead.length === 0
            ? `${sample.length}/${feeds.length} sampled feeds reachable`
            : `unreachable: ${dead.join(", ")} (sampled ${sample.length}/${feeds.length})`,
      });
    }),
  );
  return checks.sort((a, b) => a.name.localeCompare(b.name));
}

export async function cmdDoctor(
  ctx: CliContext,
  opts: { online?: boolean } = {},
): Promise<number> {
  const checks = collectDoctorChecks(ctx);
  if (opts.online) {
    let config: unknown = null;
    try {
      config = loadCliConfig(ctx).config;
    } catch {
      config = null; // the config check above already reports the failure
    }
    if (config !== null) {
      checks.push(...(await collectOnlineChecks(config)));
    } else {
      checks.push({ name: "feeds", status: "warn", detail: "skipped — config could not be loaded" });
    }
  }
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
