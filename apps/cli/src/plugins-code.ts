// Code plugin host (Plugin-P1; design: PLUGINS.md §4B).
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

import { buildTopics, heatOf, loadStore, topicKey } from "@breaker-delta/core";
import type { CandidateItem, Edition, SourceResult } from "@breaker-delta/core";

import type { CliContext } from "./context.js";
import { statePath } from "./context.js";
import {
  codeSlotsOf,
  scanPluginManifests,
  type CodeSlot,
  type PluginManifestFull,
} from "./plugins.js";

export { codeSlotsOf, type CodeSlot };

const SLOT_EXPORTS: Record<CodeSlot, string> = {
  fetcher: "fetchCandidates",
  exit: "onEdition",
  score: "scoreTopic",
};

export interface PluginCtx {
  id: string;
  /** The instance's config for this plugin (config.plugins.<id>.config). */
  config: Record<string, unknown>;
  log: (msg: string) => void;
  now: () => Date;
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
  ctx: CliContext,
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
  ctx: CliContext,
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

const SLOT_SUFFIXES: [string, string][] = [
  ["-morning", "morning"],
  ["-evening", "evening"],
  ["-pilot", "pilot"],
];

function editionSortKey(file: string): string {
  const stem = file.replace(/\.json$/, "");
  const date = stem.slice(0, 10);
  let order = 1;
  for (const [suffix, slot] of SLOT_SUFFIXES) {
    if (stem.endsWith(suffix)) order = SLOT_ORDER[slot];
  }
  return `${date}#${order}#${file}`;
}

const SLOT_ORDER: Record<string, number> = { pilot: 0, morning: 1, evening: 2 };

/** Load edition files the way every other consumer does: ordered
 *  by (date, slot) — pilot < morning < evening within a day, NOT
 *  raw filename order (evening sorts before morning as a string) —
 *  slot from the filename, _heat/_rank attached in memory. */
export function loadEditionFiles(editionsDir: string): LoadedEditionFile[] {
  if (!fs.existsSync(editionsDir)) return [];
  const files = fs
    .readdirSync(editionsDir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => {
      const ka = editionSortKey(a);
      const kb = editionSortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  return files.map((file) => {
    const data = JSON.parse(
      fs.readFileSync(path.join(editionsDir, file), "utf-8"),
    ) as LoadedEditionFile["data"];
    const stem = file.replace(/\.json$/, "");
    for (const [suffix, slot] of SLOT_SUFFIXES) {
      if (stem.endsWith(suffix)) (data as Record<string, unknown>).slot = slot;
    }
    const items = (data.items ?? []) as LoadedEditionFile["data"]["items"];
    const heats = items.map((it) => heatOf(it as never));
    const order = items.map((_, i) => i).sort((a, b) => heats[b] - heats[a]);
    order.forEach((itemIdx, rank) => {
      items[itemIdx]._heat = heats[itemIdx];
      items[itemIdx]._rank = rank + 1;
    });
    return { file, data, changed: false };
  });
}

function persistEditionFiles(editionsDir: string, loaded: LoadedEditionFile[]): number {
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
  ctx: CliContext,
  config: Record<string, unknown>,
  editionsDir: string,
): Promise<ScorePassResult> {
  const plugins = await loadEnabledCodePlugins(ctx, config, ["score"]);
  if (plugins.length === 0) return { plugins: [], scored: 0, filesWritten: 0 };
  const loaded = loadEditionFiles(editionsDir);
  if (loaded.length === 0) return { plugins: plugins.map((p) => p.id), scored: 0, filesWritten: 0 };
  const editions = loaded.map((l) => l.data) as unknown as Edition[];
  const ledger = loadStore(statePath(ctx)).topics;
  const topics = buildTopics(editions, ledger);
  let scored = 0;
  for (const topic of topics) {
    const latest = topic.apps.reduce((a, b) => (b.edition > a.edition ? b : a));
    const entry = loaded[latest.edition];
    const targets = entry.data.items.filter(
      (it) => topicKey(it as never, ledger)[0] === topic.key,
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

function exitWatermarkPath(ctx: CliContext, pluginId: string): string {
  return path.join(ctx.dataDir, "state", `plugin-exit-${pluginId}.json`);
}

/** Fire enabled exit plugins. With a watermark (publish), each
 *  plugin only receives editions after the last one it handled;
 *  without one (serve push), exactly `onlyFiles` fire. A failing
 *  plugin is reported and its watermark stays put — exit is a
 *  side channel and never fails the caller's main job. */
export async function runExitPass(
  ctx: CliContext,
  config: Record<string, unknown>,
  editionsDir: string,
  opts: { onlyFiles?: string[] } = {},
): Promise<ExitPassResult> {
  const plugins = await loadEnabledCodePlugins(ctx, config, ["exit"]);
  const result: ExitPassResult = { fired: [], errors: [] };
  if (plugins.length === 0) return result;
  const loaded = loadEditionFiles(editionsDir);
  const editions = loaded.map((l) => l.data) as unknown as Edition[];
  const ledger = loadStore(statePath(ctx)).topics;
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

// ------------------------------------------------------------ render descriptors

export interface ScoreDescriptor {
  id: string;
  label: { zh: string; en: string; ja: string };
}

/** Enabled score plugins' display descriptors (label from the
 *  manifest), for renderers to draw chips next to the heat. */
export function scoreDescriptors(
  ctx: CliContext,
  config: Record<string, unknown>,
): ScoreDescriptor[] {
  const { manifests } = scanPluginManifests(ctx);
  const out: ScoreDescriptor[] = [];
  for (const { manifest } of manifests.values()) {
    if (!codeSlotsOf(manifest).includes("score")) continue;
    if (pluginSection(config, manifest.id).enabled !== true) continue;
    const label = manifest.score?.label;
    if (!label) continue;
    out.push({
      id: manifest.id,
      label: {
        zh: label.zh ?? manifest.id,
        en: label.en ?? label.zh ?? manifest.id,
        ja: label.ja ?? label.zh ?? manifest.id,
      },
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}
