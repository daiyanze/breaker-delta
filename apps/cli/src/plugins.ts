// Panel plugin loading + enablement (Plugin-P0; design: PLUGINS.md).
//
// Definitions are declarative packs — plugins/<id>/plugin.yaml +
// panel.yaml (+ prompt.md / schema.yaml for grading-injection
// plugins) — discovered in the engine root first and the data dir
// second (a data-dir pack with the same id replaces the engine one:
// user plugins are user data). Enablement layers like everything
// else in the config: preset defaults <- instance config, read from
// the merged config's `plugins:` section. Two compat rules from the
// design: creator is ON unless something turns it off (that is the
// pre-plugin behavior, TS_CREATOR=1 default), and the TS_CREATOR /
// --creator switch keeps working as creator's outermost layer.

import * as fs from "node:fs";
import * as path from "node:path";

import { parseYaml } from "@breaker-delta/fetchers";
import type {
  LocalizedText,
  PanelBlock,
  PanelPluginDef,
} from "@breaker-delta/publisher";

import type { CliContext } from "./context.js";

interface PluginManifest {
  id: string;
  api?: number;
  order?: number;
  requires_data?: boolean;
  slots?: string[];
}

function readYamlFile(file: string): Record<string, unknown> {
  return (parseYaml(fs.readFileSync(file, "utf-8")) ?? {}) as Record<
    string,
    unknown
  >;
}

function loadPluginDir(dir: string): PanelPluginDef | null {
  const manifestFile = path.join(dir, "plugin.yaml");
  const panelFile = path.join(dir, "panel.yaml");
  if (!fs.existsSync(manifestFile) || !fs.existsSync(panelFile)) return null;
  const manifest = readYamlFile(manifestFile) as unknown as PluginManifest;
  if (!manifest.id || typeof manifest.id !== "string") {
    throw new Error(`plugin at ${dir}: plugin.yaml has no string id`);
  }
  if (manifest.api !== undefined && manifest.api !== 1) {
    throw new Error(
      `plugin "${manifest.id}": unsupported api ${String(manifest.api)} (this engine speaks api 1)`,
    );
  }
  const panel = readYamlFile(panelFile) as {
    head?: PanelPluginDef["head"];
    blocks?: PanelBlock[];
    disclaimer?: LocalizedText;
  };
  if (!panel.head || !Array.isArray(panel.blocks)) {
    throw new Error(
      `plugin "${manifest.id}": panel.yaml needs a head and a blocks list`,
    );
  }
  return {
    id: manifest.id,
    order: typeof manifest.order === "number" ? manifest.order : 100,
    requiresData:
      manifest.requires_data ?? fs.existsSync(path.join(dir, "schema.yaml")),
    head: panel.head,
    blocks: panel.blocks,
    disclaimer: panel.disclaimer,
  };
}

/** Raw manifest of any plugin pack (panel, code, or both), as
 *  parsed from plugin.yaml. Code-plugin fields (Plugin-P1) are all
 *  optional; a pack with an `entry` is a code plugin. */
export interface PluginManifestFull {
  id: string;
  api?: number;
  order?: number;
  name?: LocalizedText;
  description?: LocalizedText;
  slots?: string[];
  entry?: string;
  layer?: number;
  permissions?: {
    network?: string[] | string;
    secrets?: string[];
    write?: boolean;
  };
  score?: { label?: LocalizedText; min?: number; max?: number };
  [key: string]: unknown;
}

export interface ManifestScan {
  manifests: Map<string, { dir: string; manifest: PluginManifestFull }>;
  errors: { dir: string; message: string }[];
}

/** The code-plugin slot names (Plugin-P1). */
export const CODE_SLOTS = ["fetcher", "exit", "score"] as const;
export type CodeSlot = (typeof CODE_SLOTS)[number];

export function codeSlotsOf(manifest: PluginManifestFull): CodeSlot[] {
  const declared = new Set(manifest.slots ?? []);
  return CODE_SLOTS.filter((s) => declared.has(s));
}

/** Scan both plugin roots for manifests only (no panel
 *  requirement): code plugins may not ship a panel.yaml. */
export function scanPluginManifests(ctx: CliContext): ManifestScan {
  const manifests = new Map<string, { dir: string; manifest: PluginManifestFull }>();
  const errors: { dir: string; message: string }[] = [];
  for (const base of [path.join(ctx.rootDir, "plugins"), path.join(ctx.dataDir, "plugins")]) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      const dir = path.join(base, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      const manifestFile = path.join(dir, "plugin.yaml");
      if (!fs.existsSync(manifestFile)) continue;
      try {
        const manifest = readYamlFile(manifestFile) as unknown as PluginManifestFull;
        if (!manifest.id || typeof manifest.id !== "string") {
          throw new Error(`plugin at ${dir}: plugin.yaml has no string id`);
        }
        if (manifest.api !== undefined && manifest.api !== 1) {
          throw new Error(
            `plugin "${manifest.id}": unsupported api ${String(manifest.api)} (this engine speaks api 1)`,
          );
        }
        manifests.set(manifest.id, { dir, manifest });
      } catch (err) {
        errors.push({ dir, message: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return { manifests, errors };
}

export interface PluginScan {
  defs: Map<string, PanelPluginDef>;
  dirs: Map<string, string>;
  errors: { dir: string; message: string }[];
}

/** Scan both plugin roots without throwing: malformed packs are
 *  collected as errors (doctor reports them; publish fails on them). */
export function scanPlugins(ctx: CliContext): PluginScan {
  const defs = new Map<string, PanelPluginDef>();
  const dirs = new Map<string, string>();
  const errors: { dir: string; message: string }[] = [];
  for (const base of [path.join(ctx.rootDir, "plugins"), path.join(ctx.dataDir, "plugins")]) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      const dir = path.join(base, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
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
  }
  return { defs, dirs, errors };
}

/** All plugin definitions visible to this instance, by id. */
export function discoverPlugins(ctx: CliContext): Map<string, PanelPluginDef> {
  const { defs, errors } = scanPlugins(ctx);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
  return defs;
}

export interface PluginCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

const SCHEMA_TYPES = new Set(["string", "enum", "list"]);

/** Validate one data plugin's schema.yaml; returns a problem string
 *  or the field count when valid. */
export function validatePluginSchema(dir: string): { fields: number } | { problem: string } {
  const file = path.join(dir, "schema.yaml");
  if (!fs.existsSync(file)) return { problem: "schema.yaml missing" };
  let parsed: unknown;
  try {
    parsed = parseYaml(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    return { problem: `schema.yaml does not parse: ${err instanceof Error ? err.message : String(err)}` };
  }
  const fields = (parsed as { fields?: unknown })?.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    return { problem: "schema.yaml has no fields list" };
  }
  const seen = new Set<string>();
  for (const raw of fields) {
    const f = raw as { name?: unknown; type?: unknown; values?: unknown };
    if (typeof f?.name !== "string" || f.name === "") {
      return { problem: "schema field without a name" };
    }
    if (seen.has(f.name)) return { problem: `duplicate schema field "${f.name}"` };
    seen.add(f.name);
    if (typeof f.type !== "string" || !SCHEMA_TYPES.has(f.type)) {
      return { problem: `field "${f.name}": type must be string | enum | list` };
    }
    if (f.type === "enum" && (!Array.isArray(f.values) || f.values.length === 0)) {
      return { problem: `field "${f.name}": enum needs a non-empty values list` };
    }
  }
  return { fields: fields.length };
}

/** Doctor's plugin checks: broken packs fail, config naming an
 *  unknown plugin fails when it tries to enable it (warn when it only
 *  disables), enabled data plugins get their schema validated. */
export function collectPluginChecks(
  ctx: CliContext,
  config: Record<string, unknown>,
): PluginCheck[] {
  const checks: PluginCheck[] = [];
  const { defs, dirs, errors } = scanPlugins(ctx);
  for (const e of errors) {
    checks.push({
      name: `plugin:${path.basename(e.dir)}`,
      status: "fail",
      detail: e.message,
    });
  }
  const section = (config.plugins ?? {}) as Record<
    string,
    { enabled?: boolean } | undefined
  >;
  // Known ids = panel packs ∪ code packs (a code-only plugin like
  // momentum has no panel def but is a real pack).
  const { manifests } = scanPluginManifests(ctx);
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
    const declared = section[def.id]?.enabled;
    const on = def.id === "creator" ? declared ?? true : declared ?? false;
    if (!on) continue;
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
  // Plugin-P1 code plugins: entry presence, slot sanity, and the
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
        detail: "declares an entry but no code slot (fetcher | exit | score)",
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

/**
 * The enabled panel plugins for a build, in render order.
 * `config` is the merged (preset <- instance) config; `creatorEnabled`
 * is the already-resolved TS_CREATOR / --creator switch.
 */
export function resolvePanelPlugins(
  ctx: CliContext,
  config: Record<string, unknown>,
  creatorEnabled: boolean,
): PanelPluginDef[] {
  const section = (config.plugins ?? {}) as Record<
    string,
    { enabled?: boolean } | undefined
  >;
  const enabled: PanelPluginDef[] = [];
  for (const def of discoverPlugins(ctx).values()) {
    const declared = section[def.id]?.enabled;
    let on: boolean;
    if (def.id === "creator") {
      on = declared ?? true; // pre-plugin behavior: creator on by default
      if (!creatorEnabled) on = false; // TS_CREATOR / flags: outermost layer
    } else {
      on = declared ?? false;
    }
    if (on) enabled.push(def);
  }
  enabled.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return enabled;
}
