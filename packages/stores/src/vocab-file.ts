// Filesystem implementation of core's VocabIo (state/vocab.json).
// Moved from @breaker-delta/core's vocab.ts in Rewrite Phase 1 —
// applyVocab itself is pure and takes this as a parameter.

import * as fs from "node:fs";
import * as path from "node:path";

import type { VocabIo } from "@breaker-delta/core";

export const DEFAULT_STATE_FILE = path.join("state", "vocab.json");

export const fsVocabIo: VocabIo = {
  exists: (p) => fs.existsSync(p),
  load: (p) => {
    try {
      const data: unknown = JSON.parse(fs.readFileSync(p, "utf-8"));
      return data !== null && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  },
  save: (p, data) => {
    fs.mkdirSync(path.dirname(p) || ".", { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 1), "utf-8");
  },
};
