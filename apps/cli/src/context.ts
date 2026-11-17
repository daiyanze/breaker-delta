// Shared resolution of the CLI's world: where the instance data
// lives (--data-dir / BD_DATA_DIR / CWD), where the engine root
// lives (--root-dir / BD_ROOT_DIR / discovered upward from this
// file), and which config file governs a run.
//
// The Python engine fused engine and data in one working directory;
// the Node CLI keeps them explicit: assets, the favicon cache and
// the example configs are engine-side (rootDir), while editions/,
// state/, track-record.md and the instance config are data-side
// (dataDir).

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG_CANDIDATES, loadConfig } from "@breaker-delta/fetchers";
import type { RadarConfig } from "@breaker-delta/core";

export const VERSION = "0.22.0";

export interface CliContext {
  dataDir: string;
  rootDir: string;
  configPath?: string;
  json: boolean;
}

export function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Walk upward from `start` looking for the engine root: a directory
 * holding assets/, config.example.yaml and favicon-cache/.
 * Works for the unpacked layout (apps/cli/dist/src, root four
 * levels up) and for the single-file bundle in apps/cli/dist.
 */
export function findEngineRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (let i = 0; i < 10; i++) {
    if (
      isDir(path.join(dir, "assets")) &&
      isFile(path.join(dir, "config.example.yaml")) &&
      isDir(path.join(dir, "favicon-cache"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveRootDir(flag?: string): string {
  if (flag) return path.resolve(flag);
  const env = process.env.BD_ROOT_DIR;
  if (env) return path.resolve(env);
  return findEngineRoot(moduleDir()) ?? process.cwd();
}

export function resolveDataDir(flag?: string): string {
  if (flag) return path.resolve(flag);
  const env = process.env.BD_DATA_DIR;
  if (env) return path.resolve(env);
  return process.cwd();
}

export function statePath(ctx: CliContext): string {
  return path.join(ctx.dataDir, "state", "seen-topics.json");
}

/**
 * Config file resolution, mirroring radar/config.py's search: the
 * explicit --config path first (a missing explicit path falls
 * through to the candidates, exactly like Python), then the
 * candidate list in the data dir, then in the engine root (where
 * the config.example.* fallbacks live).
 */
export function findConfigFile(ctx: CliContext): string | null {
  if (ctx.configPath) {
    const explicit = path.isAbsolute(ctx.configPath)
      ? ctx.configPath
      : path.resolve(process.cwd(), ctx.configPath);
    if (fs.existsSync(explicit)) return explicit;
  }
  for (const dir of [ctx.dataDir, ctx.rootDir]) {
    for (const name of CONFIG_CANDIDATES) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const PRESET_NAME_RE = /^[a-z0-9][a-z0-9-_]*$/;
const PRESET_CONFIG_CANDIDATES = ["config.yaml", "config.yml", "config.json"];

/**
 * A preset's config file: presets/<name>/config.yaml (or .yml/.json).
 * The data dir is searched first (presets installed with
 * `preset add <url>` are user data and win over a bundled preset of
 * the same name), then the engine root's bundled presets. An
 * instance config names one via its `preset:` key and the preset
 * becomes the base config layer.
 */
export function findPresetConfigFile(ctx: CliContext, name: string): string | null {
  if (!PRESET_NAME_RE.test(name)) return null;
  for (const base of [ctx.dataDir, ctx.rootDir]) {
    for (const candidate of PRESET_CONFIG_CANDIDATES) {
      const p = path.join(base, "presets", name, candidate);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

export function loadCliConfig(
  ctx: CliContext,
): { config: RadarConfig; file: string | null; preset: string | null; presetFile: string | null } {
  const file = findConfigFile(ctx);
  if (!file) return { config: {} as RadarConfig, file: null, preset: null, presetFile: null };
  const config = loadConfig(file) as RadarConfig;
  const preset = typeof config.preset === "string" && config.preset !== "" ? config.preset : null;
  if (!preset) return { config, file, preset: null, presetFile: null };
  const presetFile = findPresetConfigFile(ctx, preset);
  if (!presetFile) {
    throw new Error(
      `config names preset "${preset}" but no presets/${preset}/config.yaml exists in the data dir (${ctx.dataDir}) or under the engine root (${ctx.rootDir})`,
    );
  }
  const base = loadConfig(presetFile) as RadarConfig;
  // Preset is the base layer; the instance config wins per top-level
  // section (preset defaults <- user config, per the design doc).
  return { config: { ...base, ...config }, file, preset, presetFile };
}

/**
 * Directory the publisher reads config text blocks from: the data
 * dir when it carries any config file of its own (the instance
 * config wins, as in the data-repo CI where the config is copied
 * into the build root), otherwise the engine root. The in-directory
 * fallback chain is the publisher's own (publish.py's
 * load_config_blocks).
 */
export function resolveConfigDir(ctx: CliContext): string {
  for (const name of CONFIG_CANDIDATES) {
    if (fs.existsSync(path.join(ctx.dataDir, name))) return ctx.dataDir;
  }
  return ctx.rootDir;
}
