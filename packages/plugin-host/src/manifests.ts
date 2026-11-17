// Plugin manifests, panel definitions and enablement — the pure
// half of the plugin host (Rewrite Phase 2a). One implementation
// serves the CLI (which also executes code plugins) and the web
// app (which never runs plugin code and only resolves what to
// render). Everything here works on texts and plain data; the
// filesystem scanners live in discovery.ts.

import { parseYaml } from "@breaker-delta/config";
import type {
  LocalizedText,
  PanelBlock,
  PanelPluginDef,
} from "@breaker-delta/publisher";

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
  /** Page slot (Plugin-P2): the plugin contributes one whole page. */
  page?: { slug?: string; title?: LocalizedText };
  [key: string]: unknown;
}

/** The code-plugin slot names (Plugin-P1: fetcher / exit / score;
 *  Plugin-P2 adds entities / review / page; P3 adds tools). */
export const CODE_SLOTS = ["fetcher", "exit", "score", "entities", "review", "page", "tools"] as const;
export type CodeSlot = (typeof CODE_SLOTS)[number];

export function codeSlotsOf(manifest: PluginManifestFull): CodeSlot[] {
  const declared = new Set(manifest.slots ?? []);
  return CODE_SLOTS.filter((s) => declared.has(s));
}

export function parseYamlRecord(text: string): Record<string, unknown> {
  return (parseYaml(text) ?? {}) as Record<string, unknown>;
}

/** Validate + normalize one manifest from its YAML text. */
export function manifestFromText(text: string, where: string): PluginManifestFull {
  const manifest = parseYamlRecord(text) as unknown as PluginManifestFull;
  if (!manifest.id || typeof manifest.id !== "string") {
    throw new Error(`plugin at ${where}: plugin.yaml has no string id`);
  }
  if (manifest.api !== undefined && manifest.api !== 1) {
    throw new Error(
      `plugin "${manifest.id}": unsupported api ${String(manifest.api)} (this engine speaks api 1)`,
    );
  }
  return manifest;
}

/** Build a panel definition from a pack's manifest + panel texts.
 *  `hasSchema` is whether the pack ships a schema.yaml (its
 *  presence alone marks a data plugin when the manifest does not
 *  say). Returns null when the pack has no panel (code-only). */
export function panelDefFromTexts(
  manifestText: string,
  panelText: string | null,
  hasSchema: boolean,
  where: string,
): PanelPluginDef | null {
  if (panelText === null) return null;
  const manifest = manifestFromText(manifestText, where);
  const panel = parseYamlRecord(panelText) as {
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
      (manifest as { requires_data?: boolean }).requires_data ?? hasSchema,
    head: panel.head,
    blocks: panel.blocks,
    disclaimer: panel.disclaimer,
  };
}

/** The plugins: section of a config, normalized for lookups. */
export type PluginEnablement = Record<string, { enabled?: boolean } | undefined>;

export function pluginSection(config: Record<string, unknown>): PluginEnablement {
  return (config.plugins ?? {}) as PluginEnablement;
}

/** Whether a plugin is enabled: creator defaults ON (the
 *  pre-plugin behavior), everything else defaults OFF. */
export function pluginEnabled(section: PluginEnablement, id: string): boolean {
  const declared = section[id]?.enabled;
  return id === "creator" ? declared ?? true : declared ?? false;
}

/**
 * The enabled panel plugins for a build, in render order.
 * `creatorEnabled` is the already-resolved outermost switch
 * (TS_CREATOR / --creator on the CLI; the web passes true).
 */
export function enabledPanelDefs(
  defs: Iterable<PanelPluginDef>,
  config: Record<string, unknown>,
  creatorEnabled: boolean,
): PanelPluginDef[] {
  const section = pluginSection(config);
  const enabled: PanelPluginDef[] = [];
  for (const def of defs) {
    let on = pluginEnabled(section, def.id);
    if (def.id === "creator" && !creatorEnabled) on = false;
    if (on) enabled.push(def);
  }
  enabled.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return enabled;
}

export interface ScoreDescriptor {
  id: string;
  label: { zh: string; en: string; ja: string };
}

function manifestSlots(m: PluginManifestFull): string[] {
  return Array.isArray(m.slots) ? (m.slots as string[]) : [];
}

/** Display descriptors for enabled score plugins: which labels to
 *  draw next to the scores plugins stored in items' plugins
 *  namespaces (the scores themselves are computed by the CLI
 *  pipeline; renderers never run plugin code). */
export function scoreDescriptorsFromManifests(
  manifests: Iterable<PluginManifestFull>,
  config: Record<string, unknown>,
): ScoreDescriptor[] {
  const section = pluginSection(config);
  const out: ScoreDescriptor[] = [];
  for (const m of manifests) {
    if (!manifestSlots(m).includes("score")) continue;
    if (section[m.id]?.enabled !== true) continue;
    const label = m.score?.label;
    if (!label) continue;
    out.push({
      id: m.id,
      label: {
        zh: label.zh ?? m.id,
        en: label.en ?? label.zh ?? m.id,
        ja: label.ja ?? label.zh ?? m.id,
      },
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** Enabled entity-extraction plugin ids: which plugins namespaces
 *  hold entity lists to draw as chips. */
export function entityPluginIdsFromManifests(
  manifests: Iterable<PluginManifestFull>,
  config: Record<string, unknown>,
): string[] {
  const section = pluginSection(config);
  const out: string[] = [];
  for (const m of manifests) {
    if (!manifestSlots(m).includes("entities")) continue;
    if (section[m.id]?.enabled === true) out.push(m.id);
  }
  out.sort();
  return out;
}

const SCHEMA_TYPES = new Set(["string", "enum", "list"]);

/** Validate one data plugin's schema.yaml text; returns a problem
 *  string or the field count when valid. */
export function validatePluginSchemaText(
  text: string | null,
): { fields: number } | { problem: string } {
  if (text === null) return { problem: "schema.yaml missing" };
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
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
