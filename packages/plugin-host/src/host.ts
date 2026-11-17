// Code plugin host (Plugin-P1; design: PLUGINS.md §4B). This is
// the execution half of @breaker-delta/plugin-host (Rewrite Phase
// 2a-ii) — the CLI is its only consumer, as a thin re-export.
//
// A code plugin is a pack whose plugin.yaml declares an `entry`
// (a TypeScript/ESM module) plus code slots:
//
//   fetcher  exports fetchCandidates(ctx) -> CandidateItem[]
//   exit     exports onEdition(ctx, { file, edition, topics })
//   score    exports scoreTopic(ctx, topic) -> { value, note? } | null
//
// Trust model (design §4B): v1 code plugins run with engine trust
// — no sandbox. The manifest permission declarations are still
// enforced on the ctx surface the host hands out, because they
// are the plugin's own contract and they keep accidents (and
// future remote installs) honest:
//
//   permissions.network  host allowlist for ctx.fetch ("*" = any;
//                        absent = no network at all)
//   permissions.secrets  env var names ctx.env may read
//   permissions.write    gates the plugin's private data dir
//                        (<dataDir>/plugins-data/<id>/)
//
// Code plugins run in the CLI host only (scan / publish / serve).
// The web app never executes plugin code; it renders what the
// pipeline stored (scores live in the items' plugins namespace,
// the Plugin-P0 storage contract).

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildTopics,
  dueForReview,
  heatOf,
  recordReview,
  makeTopicKeyer,
} from "@breaker-delta/core";
import { loadEditionFilesFromDir, loadStore, saveStore } from "@breaker-delta/stores";
import type { CandidateItem, Edition, SourceResult } from "@breaker-delta/core";

import { pluginRootsOf, scanPluginManifestsIn } from "./discovery.js";
import {
  codeSlotsOf,
  entityPluginIdsFromManifests,
  scoreDescriptorsFromManifests,
  type CodeSlot,
  type PluginManifestFull,
  type ScoreDescriptor,
} from "./manifests.js";

export { codeSlotsOf, type CodeSlot, type ScoreDescriptor };

/** What the host needs of an instance: where the engine lives and
 *  where the instance's data lives. The CLI's context object
 *  satisfies this structurally. */
export interface PluginHostContext {
  rootDir: string;
  dataDir: string;
}

function storePath(ctx: PluginHostContext): string {
  return path.join(ctx.dataDir, "state", "seen-topics.json");
}

function scanPluginManifests(ctx: PluginHostContext) {
  return scanPluginManifestsIn(pluginRootsOf(ctx));
}

const SLOT_EXPORTS: Record<CodeSlot, string> = {
  fetcher: "fetchCandidates",
  exit: "onEdition",
  score: "scoreTopic",
  entities: "extractEntities",
  review: "reviewTopic",
  page: "buildPage",
  tools: "pluginTools",
};

export interface PluginCtx {
  id: string;
  /** The instance's config for this plugin (config.plugins.<id>.config). */
  config: Record<string, unknown>;
  log: (msg: string) => void;
  now: () => Date;
  /** Current render language during the page pass (Plugin-P2);
   *  undefined outside it. */
  lang?: string;
  /** Read an env var declared in permissions.secrets. */
  env: (name: string) => string | undefined;
  /** fetch() restricted to the manifest's network allowlist. */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** The plugin's private writable directory (needs permissions.write). */
  dataDir: () => string;
  readData: (name: string) => string | null;
  writeData: (name: string, text: string) => void;
}

export interface CodePlugin {
  id: string;
  dir: string;
  manifest: PluginManifestFull;
  slots: CodeSlot[];
  mod: Record<string, unknown>;
  ctx: PluginCtx;
}

interface PluginSection {
  enabled?: boolean;
  config?: Record<string, unknown>;
}

function pluginSection(config: Record<string, unknown>, id: string): PluginSection {
  const section = (config.plugins ?? {}) as Record<string, PluginSection | undefined>;
  return section[id] ?? {};
}

export function makePluginCtx(
  ctx: PluginHostContext,
  manifest: PluginManifestFull,
  pluginConfig: Record<string, unknown>,
): PluginCtx {
  const id = manifest.id;
  const perms = manifest.permissions ?? {};
  const secrets = new Set(perms.secrets ?? []);
  const network = perms.network;
  const allowlist: string[] | "*" | null =
    network === undefined
      ? null
      : network === "*"
        ? "*"
        : Array.isArray(network)
          ? network
          : [network];
  const dataDirPath = path.join(ctx.dataDir, "plugins-data", id);
  const dataFile = (name: string): string => {
    if (name.includes("/") || name.includes("\\") || name.startsWith(".")) {
      throw new Error(`plugin "${id}": data file name must be a bare filename: ${name}`);
    }
    return path.join(dataDirPath, name);
  };
  const needWrite = (): void => {
    if (perms.write !== true) {
      throw new Error(`plugin "${id}": data storage needs permissions.write: true in plugin.yaml`);
    }
  };
  return {
    id,
    config: pluginConfig,
    log: (msg) => console.log(`[plugin ${id}] ${msg}`),
    now: () => new Date(),
    env: (name) => {
      if (!secrets.has(name)) {
        throw new Error(
          `plugin "${id}": env "${name}" is not declared in permissions.secrets`,
        );
      }
      return process.env[name];
    },
    fetch: async (url, init) => {
      const host = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
      if (allowlist === null) {
        throw new Error(
          `plugin "${id}": network is not declared in permissions.network (fetch to ${host} denied)`,
        );
      }
      if (
        allowlist !== "*" &&
        !allowlist.some((h) => host === h || host.endsWith(`.${h}`))
      ) {
        throw new Error(
          `plugin "${id}": host ${host} is not in permissions.network [${allowlist.join(", ")}]`,
        );
      }
      return fetch(url, init);
    },
    dataDir: () => {
      needWrite();
      fs.mkdirSync(dataDirPath, { recursive: true });
      return dataDirPath;
    },
    readData: (name) => {
      needWrite();
      const file = dataFile(name);
      return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
    },
    writeData: (name, text) => {
      needWrite();
      fs.mkdirSync(dataDirPath, { recursive: true });
      fs.writeFileSync(dataFile(name), text, "utf-8");
    },
  };
}

/** Load the enabled code plugins (config `plugins.<id>.enabled:
 *  true`; code plugins are never on by default). Throws on a
 *  broken enabled plugin — a misconfigured slot must fail loudly
 *  at the command that uses it, not silently skip. */
export async function loadEnabledCodePlugins(
  ctx: PluginHostContext,
  config: Record<string, unknown>,
  onlySlots?: CodeSlot[],
): Promise<CodePlugin[]> {
  const { manifests, errors } = scanPluginManifests(ctx);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
  const loaded: CodePlugin[] = [];
  for (const { dir, manifest } of manifests.values()) {
    if (!manifest.entry) continue;
    const slots = codeSlotsOf(manifest).filter(
      (s) => !onlySlots || onlySlots.includes(s),
    );
    if (slots.length === 0) continue;
    const section = pluginSection(config, manifest.id);
    if (section.enabled !== true) continue;
    const entryPath = path.join(dir, manifest.entry);
    if (!fs.existsSync(entryPath)) {
      throw new Error(`plugin "${manifest.id}": entry ${manifest.entry} not found in ${dir}`);
    }
    const mod = (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
    for (const slot of slots) {
      const fn = SLOT_EXPORTS[slot];
      if (typeof mod[fn] !== "function") {
        throw new Error(
          `plugin "${manifest.id}": declares slot "${slot}" but ${manifest.entry} does not export ${fn}()`,
        );
      }
    }
    loaded.push({
      id: manifest.id,
      dir,
      manifest,
      slots,
      mod,
      ctx: makePluginCtx(ctx, manifest, section.config ?? {}),
    });
  }
  loaded.sort(
    (a, b) =>
      (a.manifest.order ?? 100) - (b.manifest.order ?? 100) || a.id.localeCompare(b.id),
  );
  return loaded;
}

// ------------------------------------------------------------ fetcher slot

/** The fetchers-package module shape runScan consumes. */
export interface ExtraFetcherModule {
  SOURCE: string;
  LAYER: number;
  fetch: (
    config: unknown,
    now: Date,
    opts: { baseDir: string; env?: Record<string, string | undefined> },
  ) => Promise<SourceResult>;
}

export function fetcherModules(plugins: CodePlugin[]): ExtraFetcherModule[] {
  return plugins
    .filter((p) => p.slots.includes("fetcher"))
    .map((p) => ({
      SOURCE: p.id,
      LAYER: typeof p.manifest.layer === "number" ? p.manifest.layer : 1,
      fetch: async (): Promise<SourceResult> => {
        const raw = (await (p.mod.fetchCandidates as Function)(p.ctx)) as unknown;
        if (!Array.isArray(raw)) {
          throw new Error(`plugin "${p.id}": fetchCandidates must return an array`);
        }
        const items: CandidateItem[] = [];
        for (const entry of raw as Record<string, unknown>[]) {
          const name = String(entry?.name ?? entry?.title ?? "");
          const url = String(entry?.url ?? "");
          if (name === "" || url === "") continue;
          items.push({
            ...(entry as Record<string, unknown>),
            source: p.id,
            name,
            url,
          } as CandidateItem);
        }
        return {
          source: p.id,
          layer: typeof p.manifest.layer === "number" ? p.manifest.layer : 1,
          status: "ok",
          items,
          note: `plugin fetcher "${p.id}"`,
        };
      },
    }));
}

// ------------------------------------------------------------ shared edition loading

interface LoadedEditionFile {
  file: string;
  data: Edition & { items: (Record<string, unknown> & { _heat?: number; _rank?: number })[] };
  changed: boolean;
}

/** Edition loading is @breaker-delta/stores' single implementation
 *  (Rewrite Phase 1c): ordered by (date, slot) — pilot < morning <
 *  evening within a day — slot from the filename, _heat/_rank
 *  attached in memory. This wrapper adds the write-back tracking
 *  flag the plugin passes use. */
export function loadEditionFiles(editionsDir: string): LoadedEditionFile[] {
  return loadEditionFilesFromDir(editionsDir).map(({ file, data }) => ({
    file,
    data: data as LoadedEditionFile["data"],
    changed: false,
  }));
}

export function persistEditionFiles(editionsDir: string, loaded: LoadedEditionFile[]): number {
  let written = 0;
  for (const entry of loaded) {
    if (!entry.changed) continue;
    for (const it of entry.data.items) {
      const item = it as Record<string, unknown>;
      delete item._heat;
      delete item._rank;
    }
    delete (entry.data as Record<string, unknown>).slot;
    fs.writeFileSync(
      path.join(editionsDir, entry.file),
      JSON.stringify(entry.data, null, 2) + "\n",
      "utf-8",
    );
    written += 1;
  }
  return written;
}

// ------------------------------------------------------------ score slot

export interface ScorePassResult {
  plugins: string[];
  scored: number;
  filesWritten: number;
}

/** Run enabled score plugins over every topic's latest appearance
 *  and store { score, note? } into that item's plugins namespace
 *  (edition files are rewritten only when a score changed). */
export async function runScorePass(
  ctx: PluginHostContext,
  config: Record<string, unknown>,
  editionsDir: string,
): Promise<ScorePassResult> {
  const plugins = await loadEnabledCodePlugins(ctx, config, ["score"]);
  if (plugins.length === 0) return { plugins: [], scored: 0, filesWritten: 0 };
  const loaded = loadEditionFiles(editionsDir);
  if (loaded.length === 0) return { plugins: plugins.map((p) => p.id), scored: 0, filesWritten: 0 };
  const editions = loaded.map((l) => l.data) as unknown as Edition[];
  const ledger = loadStore(storePath(ctx)).topics;
  const topics = buildTopics(editions, ledger);
  const keyer = makeTopicKeyer(ledger);
  let scored = 0;
  for (const topic of topics) {
    const latest = topic.apps.reduce((a, b) => (b.edition > a.edition ? b : a));
    const entry = loaded[latest.edition];
    const targets = entry.data.items.filter(
      (it) => keyer(it as never)[0] === topic.key,
    );
    if (targets.length === 0) continue;
    for (const plugin of plugins) {
      const result = (await (plugin.mod.scoreTopic as Function)(
        plugin.ctx,
        topic,
      )) as { value?: unknown; note?: unknown } | null;
      if (result === null || result === undefined) continue;
      const value = Number(result.value);
      if (!Number.isFinite(value)) {
        throw new Error(
          `plugin "${plugin.id}": scoreTopic for "${topic.name}" returned a non-numeric value`,
        );
      }
      const min = plugin.manifest.score?.min;
      const max = plugin.manifest.score?.max;
      let clamped = value;
      if (typeof min === "number") clamped = Math.max(min, clamped);
      if (typeof max === "number") clamped = Math.min(max, clamped);
      const stored: Record<string, unknown> = { score: clamped };
      if (typeof result.note === "string" && result.note !== "") stored.note = result.note;
      for (const item of targets) {
        const ns = (item.plugins ?? {}) as Record<string, unknown>;
        if (JSON.stringify(ns[plugin.id]) !== JSON.stringify(stored)) {
          ns[plugin.id] = stored;
          item.plugins = ns;
          entry.changed = true;
          scored += 1;
        }
      }
    }
  }
  const filesWritten = persistEditionFiles(editionsDir, loaded);
  return { plugins: plugins.map((p) => p.id), scored, filesWritten };
}

// ------------------------------------------------------------ exit slot

export interface ExitPassResult {
  fired: { plugin: string; file: string }[];
  errors: string[];
}

function exitWatermarkPath(ctx: PluginHostContext, pluginId: string): string {
  return path.join(ctx.dataDir, "state", `plugin-exit-${pluginId}.json`);
}

/** Fire enabled exit plugins. With a watermark (publish), each
 *  plugin only receives editions after the last one it handled;
 *  without one (serve push), exactly `onlyFiles` fire. A failing
 *  plugin is reported and its watermark stays put — exit is a
 *  side channel and never fails the caller's main job. */
export async function runExitPass(
  ctx: PluginHostContext,
  config: Record<string, unknown>,
  editionsDir: string,
  opts: { onlyFiles?: string[] } = {},
): Promise<ExitPassResult> {
  const plugins = await loadEnabledCodePlugins(ctx, config, ["exit"]);
  const result: ExitPassResult = { fired: [], errors: [] };
  if (plugins.length === 0) return result;
  const loaded = loadEditionFiles(editionsDir);
  const editions = loaded.map((l) => l.data) as unknown as Edition[];
  const ledger = loadStore(storePath(ctx)).topics;
  const topics = buildTopics(editions, ledger);
  for (const plugin of plugins) {
    let files: string[];
    if (opts.onlyFiles) {
      files = opts.onlyFiles;
    } else {
      let last = "";
      const wmPath = exitWatermarkPath(ctx, plugin.id);
      if (fs.existsSync(wmPath)) {
        try {
          last = String(JSON.parse(fs.readFileSync(wmPath, "utf-8")).last ?? "");
        } catch {
          last = "";
        }
      }
      const lastIdx = loaded.findIndex((l) => l.file === last);
      files = loaded.slice(lastIdx + 1).map((l) => l.file);
    }
    for (const file of files) {
      const entry = loaded.find((l) => l.file === file);
      if (!entry) continue;
      const editionTopics = topics.filter((t) =>
        t.apps.some((a) => a.edition === loaded.indexOf(entry)),
      );
      try {
        await (plugin.mod.onEdition as Function)(plugin.ctx, {
          file,
          edition: entry.data,
          topics: editionTopics,
        });
        result.fired.push({ plugin: plugin.id, file });
        if (!opts.onlyFiles) {
          fs.mkdirSync(path.dirname(exitWatermarkPath(ctx, plugin.id)), { recursive: true });
          fs.writeFileSync(
            exitWatermarkPath(ctx, plugin.id),
            JSON.stringify({ last: file }, null, 2) + "\n",
            "utf-8",
          );
        }
      } catch (err) {
        result.errors.push(
          `plugin "${plugin.id}" on ${file}: ${err instanceof Error ? err.message : String(err)}`,
        );
        break; // keep this plugin's watermark before the failed edition
      }
    }
  }
  return result;
}

// ------------------------------------------------------------ entities slot (Plugin-P2)

export interface EntitiesPassResult {
  plugins: string[];
  stamped: number;
  filesWritten: number;
}

export interface ExtractedEntity {
  type: string;
  name: string;
}

/** Run enabled entity-extraction plugins over every topic's
 *  latest appearance and store the entity list into that item's
 *  plugins namespace (plugins.<id>.entities), same storage
 *  contract and targeting as the score pass. */
export async function runEntitiesPass(
  ctx: PluginHostContext,
  config: Record<string, unknown>,
  editionsDir: string,
): Promise<EntitiesPassResult> {
  const plugins = await loadEnabledCodePlugins(ctx, config, ["entities"]);
  if (plugins.length === 0) return { plugins: [], stamped: 0, filesWritten: 0 };
  const loaded = loadEditionFiles(editionsDir);
  if (loaded.length === 0) return { plugins: plugins.map((p) => p.id), stamped: 0, filesWritten: 0 };
  const editions = loaded.map((l) => l.data) as unknown as Edition[];
  const ledger = loadStore(storePath(ctx)).topics;
  const topics = buildTopics(editions, ledger);
  const keyer = makeTopicKeyer(ledger);
  let stamped = 0;
  for (const topic of topics) {
    const latest = topic.apps.reduce((a, b) => (b.edition > a.edition ? b : a));
    const entry = loaded[latest.edition];
    const targets = entry.data.items.filter(
      (it) => keyer(it as never)[0] === topic.key,
    );
    if (targets.length === 0) continue;
    for (const plugin of plugins) {
      const raw = (await (plugin.mod.extractEntities as Function)(
        plugin.ctx,
        topic,
      )) as unknown;
      if (!Array.isArray(raw)) {
        throw new Error(`plugin "${plugin.id}": extractEntities must return an array`);
      }
      const seen = new Set<string>();
      const entities: ExtractedEntity[] = [];
      for (const e of raw as { type?: unknown; name?: unknown }[]) {
        const name = typeof e?.name === "string" ? e.name : "";
        if (name === "") continue;
        const type = typeof e?.type === "string" && e.type !== "" ? e.type : "entity";
        const key = `${type}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entities.push({ type, name });
        if (entities.length >= 24) break;
      }
      for (const item of targets) {
        const ns = (item.plugins ?? {}) as Record<string, unknown>;
        // An empty extraction stores nothing (no namespace noise in
        // every item); a previously stored list is still refreshed,
        // including being cleared when extraction now finds none.
        if (entities.length === 0 && ns[plugin.id] === undefined) continue;
        const stored = { entities };
        if (JSON.stringify(ns[plugin.id]) !== JSON.stringify(stored)) {
          ns[plugin.id] = stored;
          item.plugins = ns;
          entry.changed = true;
          stamped += 1;
        }
      }
    }
  }
  const filesWritten = persistEditionFiles(editionsDir, loaded);
  return { plugins: plugins.map((p) => p.id), stamped, filesWritten };
}

// ------------------------------------------------------------ review slot (Plugin-P2)

export interface ReviewPassResult {
  plugins: string[];
  due: number;
  checked: { name: string; result: string; plugin: string; evidence?: string }[];
}

/** Run enabled review-metric plugins over the topics due for
 *  their 14-day review. The mechanism is the engine's (due list,
 *  recordReview, store write-back); the plugin only supplies the
 *  metric's verdict. First non-null verdict wins. */
export async function runReviewPass(
  ctx: PluginHostContext,
  config: Record<string, unknown>,
  editionsDir: string,
): Promise<ReviewPassResult> {
  const plugins = await loadEnabledCodePlugins(ctx, config, ["review"]);
  if (plugins.length === 0) return { plugins: [], due: 0, checked: [] };
  const store = loadStore(storePath(ctx));
  const due = dueForReview(store);
  const result: ReviewPassResult = { plugins: plugins.map((p) => p.id), due: due.length, checked: [] };
  if (due.length === 0) return result;
  const loaded = loadEditionFiles(editionsDir);
  const editions = loaded.map((l) => l.data) as unknown as Edition[];
  const topics = buildTopics(editions, store.topics);
  const byName = new Map(topics.map((t) => [t.name, t]));
  for (const dueTopic of due) {
    const built = byName.get(dueTopic.name);
    if (!built) continue;
    for (const plugin of plugins) {
      const verdict = (await (plugin.mod.reviewTopic as Function)(
        plugin.ctx,
        built,
        dueTopic,
      )) as { result?: unknown; evidence?: unknown } | null;
      if (!verdict) continue;
      if (verdict.result !== "hit" && verdict.result !== "miss") {
        throw new Error(
          `plugin "${plugin.id}": reviewTopic for "${dueTopic.name}" must return { result: "hit" | "miss" } or null`,
        );
      }
      recordReview(store, dueTopic.name, verdict.result);
      result.checked.push({
        name: dueTopic.name,
        result: verdict.result,
        plugin: plugin.id,
        ...(typeof verdict.evidence === "string" ? { evidence: verdict.evidence } : {}),
      });
      break;
    }
  }
  if (result.checked.length > 0) saveStore(store, storePath(ctx));
  return result;
}

// ------------------------------------------------------------ page slot (Plugin-P2)

export interface PagePassResult {
  pages: string[];
}

/** Run enabled page plugins and store their output as structured
 *  block data under <dataDir>/state/plugin-pages/<id>.json — the
 *  renderers (static + web) draw those blocks; they never execute
 *  plugin code. buildPage runs once per language with ctx.lang
 *  set, over the fully built site ({ topics, editions }). */
export async function runPagePass(
  ctx: PluginHostContext,
  config: Record<string, unknown>,
  editionsDir: string,
): Promise<PagePassResult> {
  const plugins = await loadEnabledCodePlugins(ctx, config, ["page"]);
  if (plugins.length === 0) return { pages: [] };
  const loaded = loadEditionFiles(editionsDir);
  const editions = loaded.map((l) => l.data) as unknown as Edition[];
  const ledger = loadStore(storePath(ctx)).topics;
  const topics = buildTopics(editions, ledger);
  const site = { topics, editions };
  const outDir = path.join(ctx.dataDir, "state", "plugin-pages");
  fs.mkdirSync(outDir, { recursive: true });
  const done: string[] = [];
  for (const plugin of plugins) {
    const page = plugin.manifest.page;
    if (!page?.slug || !page?.title) {
      throw new Error(`plugin "${plugin.id}": page slot needs page.slug and page.title in plugin.yaml`);
    }
    const langs: Record<string, { blocks: unknown[] }> = {};
    for (const lang of ["zh", "en", "ja"]) {
      const pctx: PluginCtx = { ...plugin.ctx, lang };
      const blocks = (await (plugin.mod.buildPage as Function)(pctx, site)) as unknown;
      if (!Array.isArray(blocks)) {
        throw new Error(`plugin "${plugin.id}": buildPage(${lang}) must return a blocks array`);
      }
      langs[lang] = { blocks };
    }
    const file = {
      id: plugin.id,
      slug: page.slug,
      title: {
        zh: page.title.zh ?? plugin.id,
        en: page.title.en ?? page.title.zh ?? plugin.id,
        ja: page.title.ja ?? page.title.zh ?? plugin.id,
      },
      langs,
    };
    fs.writeFileSync(path.join(outDir, `${plugin.id}.json`), JSON.stringify(file, null, 2) + "\n", "utf-8");
    done.push(plugin.id);
  }
  return { pages: done };
}

// ------------------------------------------------------------ render descriptors

/** Enabled score plugins' display descriptors (label from the
 *  manifest), for renderers to draw chips next to the heat. The
 *  resolution logic is manifests.ts's, shared with the web app. */
export function scoreDescriptors(
  ctx: PluginHostContext,
  config: Record<string, unknown>,
): ScoreDescriptor[] {
  const { manifests } = scanPluginManifests(ctx);
  return scoreDescriptorsFromManifests(
    [...manifests.values()].map((e) => e.manifest),
    config,
  );
}

/** Enabled entity-extraction plugin ids, for renderers to know
 *  which plugins namespaces hold entity lists worth drawing. */
export function entityPluginIds(
  ctx: PluginHostContext,
  config: Record<string, unknown>,
): string[] {
  const { manifests } = scanPluginManifests(ctx);
  return entityPluginIdsFromManifests(
    [...manifests.values()].map((e) => e.manifest),
    config,
  );
}

// ------------------------------------------------------------ tools slot (Plugin-P3)

/** One MCP tool contributed by a code plugin (Plugin-P3). The host
 *  exposes it as `<plugin-id>__<name>`; the handler receives the
 *  call arguments and the assembled site (topics + editions, the
 *  same shape the page slot gets) and returns text or any
 *  JSON-serializable value. Handlers run in the MCP server process
 *  with the plugin's usual ctx (permissions enforced as elsewhere). */
export interface PluginToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (
    args: Record<string, unknown>,
    site: { topics: ReturnType<typeof buildTopics>; editions: Edition[] },
  ) => unknown | Promise<unknown>;
}

export interface LoadedPluginTool {
  pluginId: string;
  exposedName: string;
  def: PluginToolDef;
}

const TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;

/** Load and validate the tools of every enabled tools-slot plugin. */
export async function loadPluginTools(
  ctx: PluginHostContext,
  config: Record<string, unknown>,
): Promise<LoadedPluginTool[]> {
  const plugins = await loadEnabledCodePlugins(ctx, config, ["tools"]);
  const out: LoadedPluginTool[] = [];
  const seen = new Set<string>();
  for (const plugin of plugins) {
    const raw = await (plugin.mod.pluginTools as Function)(plugin.ctx);
    if (!Array.isArray(raw)) {
      throw new Error(`plugin "${plugin.id}": pluginTools() must return an array`);
    }
    for (const entry of raw as Partial<PluginToolDef>[]) {
      if (!entry || typeof entry.name !== "string" || !TOOL_NAME_RE.test(entry.name)) {
        throw new Error(`plugin "${plugin.id}": tool name must match ${TOOL_NAME_RE}`);
      }
      if (typeof entry.description !== "string" || entry.description === "") {
        throw new Error(`plugin "${plugin.id}": tool "${entry.name}" needs a description`);
      }
      if (typeof entry.call !== "function") {
        throw new Error(`plugin "${plugin.id}": tool "${entry.name}" needs a call() handler`);
      }
      const exposedName = `${plugin.id}__${entry.name}`;
      if (seen.has(exposedName)) {
        throw new Error(`plugin "${plugin.id}": duplicate tool "${entry.name}"`);
      }
      seen.add(exposedName);
      out.push({
        pluginId: plugin.id,
        exposedName,
        def: {
          name: entry.name,
          description: entry.description,
          inputSchema:
            entry.inputSchema && typeof entry.inputSchema === "object"
              ? (entry.inputSchema as Record<string, unknown>)
              : { type: "object", properties: {} },
          call: entry.call as PluginToolDef["call"],
        },
      });
    }
  }
  return out;
}
