// Panel plugin discovery for the web app. The manifest parsing,
// validation and enablement logic is @breaker-delta/plugin-host's
// single implementation (Rewrite Phase 2a) — the same code the CLI
// runs. What stays here is only the web's sourcing: the same two
// roots as the CLI (engine plugins/ first, the data directory's
// plugins/ overriding by id) when a filesystem exists, and the
// build-time bundled packs as the fallback on Workers, where there
// is no filesystem. The web never runs plugin code: panel defs,
// score labels and entity ids are all it resolves.

import * as fs from "node:fs";
import * as path from "node:path";

import {
  enabledPanelDefs,
  entityPluginIdsFromManifests,
  manifestFromText,
  panelDefFromTexts,
  scoreDescriptorsFromManifests,
  type PluginManifestFull,
  type ScoreDescriptor,
} from "@breaker-delta/plugin-host";
import type { PanelPluginDef } from "@breaker-delta/publisher";

import { BUNDLED_MANIFESTS, BUNDLED_PLUGINS } from "./bundled-plugins";

export type PanelDef = PanelPluginDef;
export type { ScoreDescriptor };

function loadPluginDir(dir: string): PanelPluginDef | null {
  const manifestFile = path.join(dir, "plugin.yaml");
  const panelFile = path.join(dir, "panel.yaml");
  if (!fs.existsSync(manifestFile) || !fs.existsSync(panelFile)) return null;
  return panelDefFromTexts(
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
      const def = panelDefFromTexts(b.manifestText, b.panelText, b.hasSchema, "bundled plugin");
      if (def && !defs.has(def.id)) defs.set(def.id, def);
    }
  }
  return enabledPanelDefs(defs.values(), config, true);
}

// ------------------------------------------------------------ score descriptors (Plugin-P1)

/** All plugin manifests visible to this instance (both roots,
 *  bundled fallback when the filesystem is unavailable). A manifest
 *  that fails validation is skipped here — the web is a renderer
 *  and stays lenient; the CLI's doctor is where broken packs are
 *  reported. */
function scanManifests(engineDir: string, dataDir: string): Map<string, PluginManifestFull> {
  const manifests = new Map<string, PluginManifestFull>();
  let engineScanned = false;
  for (const [i, base] of [path.join(engineDir, "plugins"), path.join(dataDir, "plugins")].entries()) {
    try {
      if (!fs.existsSync(base)) continue;
      for (const entry of fs.readdirSync(base)) {
        const file = path.join(base, entry, "plugin.yaml");
        if (!fs.existsSync(file)) continue;
        try {
          const m = manifestFromText(fs.readFileSync(file, "utf-8"), file);
          manifests.set(m.id, m);
        } catch {
          // Lenient on purpose (see above).
        }
      }
      if (i === 0) engineScanned = true;
    } catch {
      // Filesystem unavailable (Workers) — bundled fallback below.
    }
  }
  if (!engineScanned) {
    for (const text of BUNDLED_MANIFESTS) {
      try {
        const m = manifestFromText(text, "bundled plugin");
        if (!manifests.has(m.id)) manifests.set(m.id, m);
      } catch {
        // A broken bundled manifest ships with the engine; the
        // engine's own contract tests keep these valid.
      }
    }
  }
  return manifests;
}

/** Display descriptors for enabled score plugins. The web never
 *  runs plugin code — scores arrive inside the items' plugins
 *  namespace, computed by the CLI pipeline; this only resolves
 *  which labels to draw next to them. */
export function loadScoreDescriptors(
  engineDir: string,
  dataDir: string,
  config: Record<string, unknown>,
): ScoreDescriptor[] {
  return scoreDescriptorsFromManifests(scanManifests(engineDir, dataDir).values(), config);
}

/** Enabled entity-extraction plugin ids (Plugin-P2): which
 *  plugins namespaces hold entity lists to draw as chips. */
export function loadEntityPluginIds(
  engineDir: string,
  dataDir: string,
  config: Record<string, unknown>,
): string[] {
  return entityPluginIdsFromManifests(scanManifests(engineDir, dataDir).values(), config);
}
