// @breaker-delta/publisher — the Breaker Delta static-site
// generator, ported from radar/publish.py with byte-level parity
// (see scripts/diff_builds.py). Pure rendering on top of
// @breaker-delta/core; the only I/O is the output tree and the
// favicon cache.

export { buildDocsSite, buildSite, renderSiteMap, writeDataFiles, writeDiscovery } from "./build.js";
export { DOC_FILES, DOC_PAGES, docsNav, type DocPage } from "./docs.js";
export { optionsFromEnv, type BuildOptions, type Ctx } from "./ctx.js";
export {
  renderPanel,
  pickText,
  type LocalizedText,
  type PanelBlock,
  type PanelFieldItem,
  type PanelListItem,
  type PanelPluginDef,
  type PanelValue,
} from "./plugins.js";
export { loadConfigBlocks, loadEditions, loadPluginPages, sourceBlock, sourceKey, yamlSourceBlocks, type PluginPageData } from "./load.js";
export {
  addedLangs,
  blobLang,
  loadLangPacksFromDir,
  mergedHtmlLangs,
  mergedLangLabels,
  mergedStrings,
  type LangPack,
} from "./langpacks.js";
// Shared presentation constants, re-exported for the web app so
// the dynamic front end renders with the same strings/styles as
// the static build instead of drifting copies. The string tables
// themselves live in @breaker-delta/i18n (Rewrite Phase 3b); the
// stylesheet and data tables are the publisher's assets.
export {
  ABOUT,
  ARC_NAMES,
  CAT_I18N,
  HTML_LANG,
  LANDING,
  LANG_LABEL,
  LEVEL_I18N,
  SLOT_LABEL_I18N,
  SRC_NAMES,
  STRINGS,
} from "@breaker-delta/i18n";
export { CAT_KEYS, CSS, LEVELS, SOURCE_DOMAINS } from "./assets.js";
export { fetchFavicons } from "./favicon.js";
export type { App, BoardState, PubTopic, SourceStat } from "./types.js";
