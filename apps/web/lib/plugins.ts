// Panel plugin discovery for the web app: the same two roots and the
// same enablement layering as the CLI (apps/cli/src/plugins.ts) —
// engine plugins/ first, the data directory's plugins/ overriding by
// id; `plugins:` config section decides enablement, creator defaults
// on, everything else defaults off. (Unifying this loader with the
// CLI's into a shared package is P2c work.)

import * as fs from "node:fs";
import * as path from "node:path";

import { parseYaml } from "@breaker-delta/fetchers";
import type { PanelPluginDef } from "@breaker-delta/publisher";

export type PanelDef = PanelPluginDef;

interface Manifest {
  id?: unknown;
  api?: unknown;
  order?: unknown;
  requires_data?: unknown;
}

function readYamlFile(file: string): Record<string, unknown> {
  return (parseYaml(fs.readFileSync(file, "utf-8")) ?? {}) as Record<string, unknown>;
}

function loadPluginDir(dir: string): PanelPluginDef | null {
  const manifestFile = path.join(dir, "plugin.yaml");
  const panelFile = path.join(dir, "panel.yaml");
  if (!fs.existsSync(manifestFile) || !fs.existsSync(panelFile)) return null;
  const manifest = readYamlFile(manifestFile) as Manifest;
  if (!manifest.id || typeof manifest.id !== "string") {
    throw new Error(`plugin at ${dir}: plugin.yaml has no string id`);
  }
  if (manifest.api !== undefined && manifest.api !== 1) {
    throw new Error(`plugin "${manifest.id}": unsupported api ${String(manifest.api)}`);
  }
  const panel = readYamlFile(panelFile) as {
    head?: PanelPluginDef["head"];
    blocks?: PanelPluginDef["blocks"];
    disclaimer?: PanelPluginDef["disclaimer"];
  };
  if (!panel.head || !Array.isArray(panel.blocks)) {
    throw new Error(`plugin "${manifest.id}": panel.yaml needs a head and a blocks list`);
  }
  return {
    id: manifest.id,
    order: typeof manifest.order === "number" ? manifest.order : 100,
    requiresData:
      (manifest.requires_data as boolean | undefined) ??
      fs.existsSync(path.join(dir, "schema.yaml")),
    head: panel.head,
    blocks: panel.blocks,
    disclaimer: panel.disclaimer,
  };
}

export function loadPanelDefs(
  engineDir: string,
  dataDir: string,
  config: Record<string, unknown>,
): PanelPluginDef[] {
  const defs = new Map<string, PanelPluginDef>();
  for (const base of [path.join(engineDir, "plugins"), path.join(dataDir, "plugins")]) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      const dir = path.join(base, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      const def = loadPluginDir(dir);
      if (def) defs.set(def.id, def);
    }
  }
  const section = (config.plugins ?? {}) as Record<string, { enabled?: boolean } | undefined>;
  const enabled: PanelPluginDef[] = [];
  for (const def of defs.values()) {
    const declared = section[def.id]?.enabled;
    const on = def.id === "creator" ? (declared ?? true) : (declared ?? false);
    if (on) enabled.push(def);
  }
  enabled.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return enabled;
}
