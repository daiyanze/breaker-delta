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
export { loadConfigBlocks, loadEditions, sourceBlock, sourceKey, yamlSourceBlocks } from "./load.js";
// Shared presentation constants, re-exported for the P2 web app so the
// dynamic front end renders with the same strings/styles as the
// static build instead of drifting copies.
export {
  ARC_NAMES,
  CAT_KEYS,
  CSS,
  HTML_LANG,
  LANG_LABEL,
  LEVELS,
  SLOT_LABEL_I18N,
  STRINGS,
} from "./literals.js";
export { fetchFavicons } from "./favicon.js";
export type { App, BoardState, PubTopic, SourceStat } from "./types.js";
