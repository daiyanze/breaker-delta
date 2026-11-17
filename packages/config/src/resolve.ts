// Instance config resolution with preset layering — the single
// implementation of "the effective config" (Rewrite Phase 1b).
// Moved from the CLI's context.ts; the CLI keeps thin wrappers with
// its historical names, and the web app layers the same way over
// its bundled presets.
//
// Layering (design doc): preset defaults <- instance config <-
// environment. The merge is per top-level section: the instance
// config wins section by section over the preset base.

import * as fs from "node:fs";
import * as path from "node:path";

import type { RadarConfig } from "@breaker-delta/core";

import { CONFIG_CANDIDATES, loadConfig } from "./config.js";

/**
 * Config file resolution, mirroring radar/config.py's search: the
 * explicit path first (a missing explicit path falls through to
 * the candidates, exactly like Python), then the candidate list in
 * each of `dirs`, in order.
 */
export function findConfigFileIn(dirs: string[], explicitPath?: string): string | null {
  if (explicitPath) {
    const explicit = path.isAbsolute(explicitPath)
      ? explicitPath
      : path.resolve(process.cwd(), explicitPath);
    if (fs.existsSync(explicit)) return explicit;
  }
  for (const dir of dirs) {
    for (const name of CONFIG_CANDIDATES) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

export const PRESET_NAME_RE = /^[a-z0-9][a-z0-9-_]*$/;
export const PRESET_CONFIG_CANDIDATES = ["config.yaml", "config.yml", "config.json"];

/**
 * A preset's config file: presets/<name>/config.yaml (or .yml /
 * .json) under the first of `dirs` that has one. Callers pass the
 * data dir before the engine root, so presets installed with
 * `preset add <url>` (user data) win over a bundled preset of the
 * same name.
 */
export function findPresetConfigFileIn(dirs: string[], name: string): string | null {
  if (!PRESET_NAME_RE.test(name)) return null;
  for (const base of dirs) {
    for (const candidate of PRESET_CONFIG_CANDIDATES) {
      const p = path.join(base, "presets", name, candidate);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/** Preset names available under any of `dirs` (sorted, deduped). */
export function listPresetNamesIn(dirs: string[]): string[] {
  const names = new Set<string>();
  for (const base of dirs) {
    const dir = path.join(base, "presets");
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) names.add(entry.name);
    }
  }
  return [...names].sort();
}

export interface EffectiveConfig {
  config: RadarConfig;
  file: string | null;
  preset: string | null;
  presetFile: string | null;
}

/**
 * Resolve the effective config for an instance: find its config
 * file across [dataDir, rootDir], and when it names a preset, layer
 * that preset's config underneath (data dir presets first). Throws
 * when a named preset cannot be found — a config that names a
 * missing preset is a setup error, not a silent default.
 */
export function loadEffectiveConfig(opts: {
  dataDir: string;
  rootDir: string;
  configPath?: string;
}): EffectiveConfig {
  const dirs = [opts.dataDir, opts.rootDir];
  const file = findConfigFileIn(dirs, opts.configPath);
  if (!file) return { config: {} as RadarConfig, file: null, preset: null, presetFile: null };
  const config = loadConfig(file) as RadarConfig;
  const preset = typeof config.preset === "string" && config.preset !== "" ? config.preset : null;
  if (!preset) return { config, file, preset: null, presetFile: null };
  const presetFile = findPresetConfigFileIn(dirs, preset);
  if (!presetFile) {
    throw new Error(
      `config names preset "${preset}" but no presets/${preset}/config.yaml exists in the data dir (${opts.dataDir}) or under the engine root (${opts.rootDir})`,
    );
  }
  const base = loadConfig(presetFile) as RadarConfig;
  // Preset is the base layer; the instance config wins per top-level
  // section (preset defaults <- user config, per the design doc).
  return { config: { ...base, ...config }, file, preset, presetFile };
}

/**
 * Layer a preset config underneath an already-parsed instance
 * config (the web app's path: the instance text arrives via its
 * store backend, the preset text from the bundled engine files).
 * Pure text-in/text-out counterpart of loadEffectiveConfig.
 */
export function layerPresetConfig(
  instance: Record<string, unknown>,
  presetConfig: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!presetConfig) return instance;
  return { ...presetConfig, ...instance };
}
