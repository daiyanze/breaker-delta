// Filesystem plugin discovery (Rewrite Phase 2a): scan plugin
// roots for packs, in order — later roots override earlier ones by
// id (the engine root first, the data dir second: user plugins are
// user data). Malformed packs are collected as errors, never thrown
// from the scanners; doctor reports them and publish fails on them.

import * as fs from "node:fs";
import * as path from "node:path";

import type { PanelPluginDef } from "@breaker-delta/publisher";

import {
  codeSlotsOf,
  manifestFromText,
  panelDefFromTexts,
  pluginEnabled,
  pluginSection,
  validatePluginSchemaText,
  type PluginManifestFull,
} from "./manifests.js";

function readText(file: string): string {
  return fs.readFileSync(file, "utf-8");
}

function* pluginDirs(roots: string[]): Generator<string> {
  for (const base of roots) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      const dir = path.join(base, entry);
      if (fs.statSync(dir).isDirectory()) yield dir;
    }
  }
}

/** Load one plugin directory's panel definition (null when the
 *  pack has no panel.yaml — a code-only plugin). */
export function loadPluginDir(dir: string): PanelPluginDef | null {
  const manifestFile = path.join(dir, "plugin.yaml");
  const panelFile = path.join(dir, "panel.yaml");
  if (!fs.existsSync(manifestFile) || !fs.existsSync(panelFile)) return null;
  return panelDefFromTexts(
    readText(manifestFile),
    readText(panelFile),
    fs.existsSync(path.join(dir, "schema.yaml")),
    dir,
  );
}

export interface ManifestScan {
  manifests: Map<string, { dir: string; manifest: PluginManifestFull }>;
  errors: { dir: string; message: string }[];
}

/** Scan the roots for manifests only (no panel requirement): code
 *  plugins may not ship a panel.yaml. */
export function scanPluginManifestsIn(roots: string[]): ManifestScan {
  const manifests = new Map<string, { dir: string; manifest: PluginManifestFull }>();
  const errors: { dir: string; message: string }[] = [];
  for (const dir of pluginDirs(roots)) {
    const manifestFile = path.join(dir, "plugin.yaml");
    if (!fs.existsSync(manifestFile)) continue;
    try {
      const manifest = manifestFromText(readText(manifestFile), dir);
      manifests.set(manifest.id, { dir, manifest });
    } catch (err) {
      errors.push({ dir, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { manifests, errors };
}

export interface PluginScan {
  defs: Map<string, PanelPluginDef>;
  dirs: Map<string, string>;
  errors: { dir: string; message: string }[];
}

/** Scan the roots for panel definitions without throwing. */
export function scanPluginsIn(roots: string[]): PluginScan {
  const defs = new Map<string, PanelPluginDef>();
  const dirs = new Map<string, string>();
  const errors: { dir: string; message: string }[] = [];
  for (const dir of pluginDirs(roots)) {
    try {
      const def = loadPluginDir(dir);
      if (def) {
        defs.set(def.id, def);
        dirs.set(def.id, dir);
      }
    } catch (err) {
      errors.push({ dir, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { defs, dirs, errors };
}

/** Validate one data plugin's schema.yaml on disk. */
export function validatePluginSchema(dir: string): { fields: number } | { problem: string } {
  const file = path.join(dir, "schema.yaml");
  if (!fs.existsSync(file)) return { problem: "schema.yaml missing" };
  return validatePluginSchemaText(readText(file));
}

export interface PluginCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

/** Doctor's plugin checks: broken packs fail, config naming an
 *  unknown plugin fails when it tries to enable it (warn when it
 *  only disables), enabled data plugins get their schema validated,
 *  and enabled code plugins get their declared-permission surface
 *  reported. */
export function collectPluginChecksIn(
  roots: string[],
  config: Record<string, unknown>,
): PluginCheck[] {
  const checks: PluginCheck[] = [];
  const { defs, dirs, errors } = scanPluginsIn(roots);
  for (const e of errors) {
    checks.push({
      name: `plugin:${path.basename(e.dir)}`,
      status: "fail",
      detail: e.message,
    });
  }
  const section = pluginSection(config);
  // Known ids = panel packs ∪ code packs (a code-only plugin like
  // momentum has no panel def but is a real pack).
  const { manifests } = scanPluginManifestsIn(roots);
  for (const [id, v] of Object.entries(section)) {
    if (defs.has(id) || manifests.has(id)) continue;
    if (v?.enabled === true) {
      checks.push({
        name: "plugins",
        status: "fail",
        detail: `config enables unknown plugin "${id}" — no such pack under plugins/`,
      });
    } else {
      checks.push({
        name: "plugins",
        status: "warn",
        detail: `config mentions unknown plugin "${id}" (not enabled)`,
      });
    }
  }
  for (const def of defs.values()) {
    if (!pluginEnabled(section, def.id)) continue;
    if (def.requiresData) {
      const result = validatePluginSchema(dirs.get(def.id) ?? "");
      checks.push(
        "problem" in result
          ? { name: `plugin:${def.id}`, status: "fail", detail: `enabled but ${result.problem}` }
          : {
              name: `plugin:${def.id}`,
              status: "ok",
              detail: `enabled, schema ${result.fields} fields`,
            },
      );
    } else {
      checks.push({ name: `plugin:${def.id}`, status: "ok", detail: "enabled (panel)" });
    }
  }
  if (defs.size === 0 && errors.length === 0) {
    checks.push({ name: "plugins", status: "warn", detail: "no plugin packs found under plugins/" });
  }
  // Code plugins: entry presence, slot sanity, and the
  // declared-permission surface of enabled packs.
  for (const { dir, manifest } of manifests.values()) {
    if (!manifest.entry) continue;
    const slots = codeSlotsOf(manifest);
    const on = section[manifest.id]?.enabled === true;
    const name = `plugin:${manifest.id}`;
    if (slots.length === 0) {
      checks.push({
        name,
        status: "fail",
        detail: "declares an entry but no code slot (fetcher | exit | score | entities | review | page | tools)",
      });
      continue;
    }
    const entryPath = `${dir}/${manifest.entry}`;
    if (!fs.existsSync(entryPath)) {
      checks.push({ name, status: "fail", detail: `entry ${manifest.entry} not found` });
      continue;
    }
    if (!on) {
      checks.push({ name, status: "ok", detail: `code plugin present, not enabled (slots: ${slots.join(", ")})` });
      continue;
    }
    if (slots.includes("score") && !manifest.score?.label) {
      checks.push({ name, status: "fail", detail: "score slot needs a score.label in plugin.yaml" });
      continue;
    }
    if (slots.includes("page") && (!manifest.page?.slug || !manifest.page?.title)) {
      checks.push({ name, status: "fail", detail: "page slot needs page.slug and page.title in plugin.yaml" });
      continue;
    }
    const notes: string[] = [`enabled (slots: ${slots.join(", ")})`];
    const perms = manifest.permissions ?? {};
    if ((slots.includes("fetcher") || slots.includes("exit")) && perms.network === undefined) {
      notes.push("no network declared — ctx.fetch will deny all hosts");
    }
    for (const secret of perms.secrets ?? []) {
      if (!process.env[secret]) notes.push(`secret ${secret} is not set in the environment`);
    }
    checks.push({
      name,
      status: notes.length > 1 ? "warn" : "ok",
      detail: notes.join("; "),
    });
  }
  return checks;
}
