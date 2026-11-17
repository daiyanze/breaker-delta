// File-backed topic store (state/seen-topics.json). Moved verbatim
// from @breaker-delta/core's store.ts in Rewrite Phase 1: the pure
// store logic (upsert/review) stays in core; reading and writing the
// JSON file is an adapter concern and lives here.

import * as fs from "node:fs";
import * as path from "node:path";

import type { TopicStore } from "@breaker-delta/core";

export const DEFAULT_STATE_PATH = path.join("state", "seen-topics.json");

export function loadStore(storePath: string = DEFAULT_STATE_PATH): TopicStore {
  if (!fs.existsSync(storePath)) return { topics: [] };
  const data = JSON.parse(fs.readFileSync(storePath, "utf-8")) as TopicStore;
  data.topics ??= [];
  return data;
}

/** Write the store atomically (temp file + rename), like Python. */
export function saveStore(store: TopicStore, storePath: string = DEFAULT_STATE_PATH): void {
  const directory = path.dirname(path.resolve(storePath));
  fs.mkdirSync(directory, { recursive: true });
  const tmp = path.join(
    directory,
    `.seen-topics-${Date.now()}-${Math.floor(Math.random() * 1e9)}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
    fs.renameSync(tmp, storePath);
  } catch (err) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    throw err;
  }
}
