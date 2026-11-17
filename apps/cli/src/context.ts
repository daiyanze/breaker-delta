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

import {
  CONFIG_CANDIDATES,
  findConfigFileIn,
  findPresetConfigFileIn,
  loadEffectiveConfig,
} from "@breaker-delta/config";
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
 * Config resolution lives in @breaker-delta/config (Rewrite
 * Phase 1b); these wrappers keep the CLI's historical names and
 * CliContext-shaped signatures. Search order: data dir first, then
 * the engine root (where the config.example.* fallbacks live); a
 * preset named by the instance config becomes the base layer, and
 * data-dir presets win over bundled ones.
 */
export function findConfigFile(ctx: CliContext): string | null {
  return findConfigFileIn([ctx.dataDir, ctx.rootDir], ctx.configPath);
}

export function findPresetConfigFile(ctx: CliContext, name: string): string | null {
  return findPresetConfigFileIn([ctx.dataDir, ctx.rootDir], name);
}

export function loadCliConfig(
  ctx: CliContext,
): { config: RadarConfig; file: string | null; preset: string | null; presetFile: string | null } {
  return loadEffectiveConfig({
    dataDir: ctx.dataDir,
    rootDir: ctx.rootDir,
    configPath: ctx.configPath,
  });
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
