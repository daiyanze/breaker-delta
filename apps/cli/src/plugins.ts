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

/** All plugin definitions visible to this instance, by id. */
export function discoverPlugins(ctx: CliContext): Map<string, PanelPluginDef> {
  const found = new Map<string, PanelPluginDef>();
  for (const base of [path.join(ctx.rootDir, "plugins"), path.join(ctx.dataDir, "plugins")]) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      const dir = path.join(base, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      const def = loadPluginDir(dir);
      if (def) found.set(def.id, def);
    }
  }
  return found;
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
