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

import { BUNDLED_PLUGINS } from "./bundled-plugins";

export type PanelDef = PanelPluginDef;

interface Manifest {
  id?: unknown;
  api?: unknown;
  order?: unknown;
  requires_data?: unknown;
}

function parseYamlText(text: string): Record<string, unknown> {
  return (parseYaml(text) ?? {}) as Record<string, unknown>;
}

function defFromTexts(
  manifestText: string,
  panelText: string,
  hasSchema: boolean,
  where: string,
): PanelPluginDef {
  const manifest = parseYamlText(manifestText) as Manifest;
  if (!manifest.id || typeof manifest.id !== "string") {
    throw new Error(`plugin at ${where}: plugin.yaml has no string id`);
  }
  if (manifest.api !== undefined && manifest.api !== 1) {
    throw new Error(`plugin "${manifest.id}": unsupported api ${String(manifest.api)}`);
  }
  const panel = parseYamlText(panelText) as {
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
    requiresData: (manifest.requires_data as boolean | undefined) ?? hasSchema,
    head: panel.head,
    blocks: panel.blocks,
    disclaimer: panel.disclaimer,
  };
}

function loadPluginDir(dir: string): PanelPluginDef | null {
  const manifestFile = path.join(dir, "plugin.yaml");
  const panelFile = path.join(dir, "panel.yaml");
  if (!fs.existsSync(manifestFile) || !fs.existsSync(panelFile)) return null;
  return defFromTexts(
    fs.readFileSync(manifestFile, "utf-8"),
    fs.readFileSync(panelFile, "utf-8"),
    fs.existsSync(path.join(dir, "schema.yaml")),
    dir,
  );
}

export function loadPanelDefs(
  engineDir: string,
  dataDir: string,
  config: Record<string, unknown>,
): PanelPluginDef[] {
  const defs = new Map<string, PanelPluginDef>();
  let engineScanned = false;
  for (const [i, base] of [path.join(engineDir, "plugins"), path.join(dataDir, "plugins")].entries()) {
    try {
      if (!fs.existsSync(base)) continue;
      for (const entry of fs.readdirSync(base)) {
        const dir = path.join(base, entry);
        if (!fs.statSync(dir).isDirectory()) continue;
        const def = loadPluginDir(dir);
        if (def) defs.set(def.id, def);
      }
      if (i === 0) engineScanned = true;
    } catch {
      // Filesystem unavailable (Workers) — handled by the fallback.
    }
  }
  if (!engineScanned) {
    // No engine plugins directory to discover from (Workers): fall
    // back to the engine plugins bundled at build time.
    // Data-directory plugins are a self-host feature and do not
    // exist in this mode.
    for (const b of BUNDLED_PLUGINS) {
      const def = defFromTexts(b.manifestText, b.panelText, b.hasSchema, "bundled plugin");
      if (!defs.has(def.id)) defs.set(def.id, def);
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
