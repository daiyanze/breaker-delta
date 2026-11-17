// Panel plugin loading + enablement (Plugin-P0; design: PLUGINS.md).
//
// The implementation lives in @breaker-delta/plugin-host (Rewrite
// Phase 2a) — one host for the CLI and the web app. This module
// keeps the CLI's historical names and CliContext-shaped
// signatures as thin wrappers.
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

import * as path from "node:path";

import {
  collectPluginChecksIn,
  enabledPanelDefs,
  scanPluginManifestsIn,
  scanPluginsIn,
  validatePluginSchema as validatePluginSchemaFile,
  type ManifestScan,
  type PluginCheck,
  type PluginScan,
} from "@breaker-delta/plugin-host";
import type { PanelPluginDef } from "@breaker-delta/publisher";

import type { CliContext } from "./context.js";

export {
  CODE_SLOTS,
  codeSlotsOf,
  type CodeSlot,
  type PluginManifestFull,
} from "@breaker-delta/plugin-host";
export type { ManifestScan, PluginCheck, PluginScan };

function pluginRoots(ctx: CliContext): string[] {
  return [path.join(ctx.rootDir, "plugins"), path.join(ctx.dataDir, "plugins")];
}

/** Scan both plugin roots for manifests only (no panel
 *  requirement): code plugins may not ship a panel.yaml. */
export function scanPluginManifests(ctx: CliContext): ManifestScan {
  return scanPluginManifestsIn(pluginRoots(ctx));
}

/** Scan both plugin roots without throwing: malformed packs are
 *  collected as errors (doctor reports them; publish fails on them). */
export function scanPlugins(ctx: CliContext): PluginScan {
  return scanPluginsIn(pluginRoots(ctx));
}

/** All plugin definitions visible to this instance, by id. */
export function discoverPlugins(ctx: CliContext): Map<string, PanelPluginDef> {
  const { defs, errors } = scanPlugins(ctx);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
  return defs;
}

/** Validate one data plugin's schema.yaml; returns a problem string
 *  or the field count when valid. */
export function validatePluginSchema(dir: string): { fields: number } | { problem: string } {
  return validatePluginSchemaFile(dir);
}

/** Doctor's plugin checks: broken packs fail, config naming an
 *  unknown plugin fails when it tries to enable it (warn when it only
 *  disables), enabled data plugins get their schema validated. */
export function collectPluginChecks(
  ctx: CliContext,
  config: Record<string, unknown>,
): PluginCheck[] {
  return collectPluginChecksIn(pluginRoots(ctx), config);
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
  return enabledPanelDefs(discoverPlugins(ctx).values(), config, creatorEnabled);
}
