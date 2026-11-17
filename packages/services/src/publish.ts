// The publish pipeline's shared pieces (Rewrite Phase 2c): the
// config-derived build options both publishers apply (the CLI's
// static publish and serve's in-memory render), and the plugin
// passes that run before a publish build. Report lines are the
// pipeline's historical wording; the caller decides where they go
// (stdout, stderr in --json mode, a log).

import { catRulesFromConfig } from "@breaker-delta/core";
import {
  enabledPanelDefs,
  entityPluginIds,
  pluginRootsOf,
  runEntitiesPass,
  runPagePass,
  runScorePass,
  scanPluginsIn,
  scoreDescriptors,
  type PluginHostContext,
  type ScoreDescriptor,
} from "@breaker-delta/plugin-host";
import { loadLangPacksFromDir, type BuildOptions, type LangPack } from "@breaker-delta/publisher";

/** Category rules + enabled panel plugins from the effective
 *  config, applied onto a BuildOptions in place. */
export function applyConfigOptions(
  opts: BuildOptions,
  host: PluginHostContext,
  config: unknown,
  creatorEnabled: boolean,
): void {
  const catRules = catRulesFromConfig(config);
  if (catRules) opts.catRules = catRules;
  const { defs, errors } = scanPluginsIn(pluginRootsOf(host));
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
  opts.panelPlugins = enabledPanelDefs(
    defs.values(),
    config as Record<string, unknown>,
    creatorEnabled,
  );
}

/** The language-pack failure both publishers report identically;
 *  each caller throws it with its own error type. */
export function langPackError(problems: string[]): Error {
  return new Error(
    `language pack problems:\n${problems.map((p) => `  ${p}`).join("\n")}`,
  );
}

/** Load the data dir's language packs onto the options; returns
 *  the packs (empty when none) and any problems found. */
export function loadLangPackOptions(
  opts: BuildOptions,
  dataDir: string,
): { packs: LangPack[]; problems: string[] } {
  const { packs, problems } = loadLangPacksFromDir(dataDir);
  if (problems.length === 0 && packs.length > 0) opts.langPacks = packs;
  return { packs, problems };
}

export interface PublishPassesResult {
  scorePlugins: ScoreDescriptor[];
  entityPlugins: string[];
}

/**
 * The pre-build plugin passes, in pipeline order: score, then
 * entities (both store their results into the edition items), then
 * pages (block data for the build to render). The exit pass is NOT
 * part of this — it fires after the build, and serve fires it per
 * pushed edition instead.
 */
export async function runPublishPasses(
  host: PluginHostContext,
  config: Record<string, unknown>,
  editionsDir: string,
  report: (line: string) => void,
): Promise<PublishPassesResult> {
  const scoreRes = await runScorePass(host, config, editionsDir);
  if (scoreRes.plugins.length > 0) {
    report(
      `plugin scores: ${scoreRes.plugins.join(", ")} — ` +
        `${scoreRes.scored} item(s) updated in ${scoreRes.filesWritten} edition file(s)`,
    );
  }
  const scorePlugins = scoreDescriptors(host, config);
  const entRes = await runEntitiesPass(host, config, editionsDir);
  if (entRes.plugins.length > 0) {
    report(
      `plugin entities: ${entRes.plugins.join(", ")} — ` +
        `${entRes.stamped} item(s) updated in ${entRes.filesWritten} edition file(s)`,
    );
  }
  const entityPlugins = entityPluginIds(host, config);
  const pageRes = await runPagePass(host, config, editionsDir);
  if (pageRes.pages.length > 0) {
    report(`plugin pages: ${pageRes.pages.join(", ")}`);
  }
  return { scorePlugins, entityPlugins };
}
