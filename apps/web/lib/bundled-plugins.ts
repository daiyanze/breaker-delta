// The built-in panel plugin definitions, bundled at build time.
// On hosts without a filesystem (Cloudflare Workers) the fs-based
// discovery in plugins.ts finds nothing, so the three engine
// plugins are compiled in from their YAML sources instead. The
// repo-root plugins/ directory stays the single source of truth —
// these are imports of those very files, not copies.

import creatorManifest from "../../../plugins/creator/plugin.yaml?raw";
import creatorPanel from "../../../plugins/creator/panel.yaml?raw";
import investorManifest from "../../../plugins/investor/plugin.yaml?raw";
import investorPanel from "../../../plugins/investor/panel.yaml?raw";
import watchlistManifest from "../../../plugins/watchlist/plugin.yaml?raw";
import watchlistPanel from "../../../plugins/watchlist/panel.yaml?raw";

export interface BundledPlugin {
  manifestText: string;
  panelText: string;
  /** Whether the plugin directory carries a schema.yaml (drives
   * requiresData when the manifest does not declare it). */
  hasSchema: boolean;
}

export const BUNDLED_PLUGINS: BundledPlugin[] = [
  { manifestText: creatorManifest, panelText: creatorPanel, hasSchema: false },
  { manifestText: investorManifest, panelText: investorPanel, hasSchema: true },
  { manifestText: watchlistManifest, panelText: watchlistPanel, hasSchema: true },
];
