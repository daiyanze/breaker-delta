// Site assembly for read-side consumers (Rewrite Phase 2c): the
// {topics, editions} pair the MCP tools (radar_board / radar_topic
// / radar_editions and every plugin-contributed tool) receive.
// One assembly, loaded exactly like the plugin passes load
// editions: the stores loader (slot from filename, heat attached)
// + the ledger + core's buildTopics.

import * as path from "node:path";

import { buildTopics, type Edition, type Topic } from "@breaker-delta/core";
import { loadEditionFilesFromDir, loadStore } from "@breaker-delta/stores";

export interface AssembledSite {
  topics: Topic[];
  editions: Edition[];
}

export function assembleSite(dataDir: string): AssembledSite {
  const loaded = loadEditionFilesFromDir(path.join(dataDir, "editions"));
  const editions = loaded.map((l) => l.data) as Edition[];
  const ledger = loadStore(path.join(dataDir, "state", "seen-topics.json")).topics;
  return { topics: buildTopics(editions, ledger), editions };
}
