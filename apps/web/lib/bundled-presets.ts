// Bundled presets for the web app (Rewrite Phase 1b).
//
// The CLI resolves presets from disk (data dir first, then the
// engine root). The web app has no filesystem for this on Workers,
// so the bundled presets ship as build-time ?raw imports — the
// same mechanism as bundled-plugins.ts. The layering itself is
// @breaker-delta/config's, identical to the CLI's: the preset is
// the base layer, the instance config wins per top-level section.
//
// Boundary: a preset that is not bundled here cannot be layered by
// the web app (the instance config then stands alone, as before
// Phase 1b). The CLI remains the authoritative resolver.

import { layerPresetConfig, parseConfigText } from "@breaker-delta/config";

import aiTechPresetText from "../../../presets/ai-tech/config.yaml?raw";

const BUNDLED_PRESET_TEXTS: Record<string, string> = {
  "ai-tech": aiTechPresetText,
};

export function bundledPresetConfig(name: unknown): Record<string, unknown> | null {
  if (typeof name !== "string" || name === "") return null;
  const text = BUNDLED_PRESET_TEXTS[name];
  return text ? parseConfigText(text) : null;
}

/** The instance config with its named bundled preset layered under it. */
export function effectiveWebConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return layerPresetConfig(config, bundledPresetConfig(config.preset));
}
