// Rolling name vocabulary, ported from radar/vocab.py. Entity names
// (repos, models, tools, apps) are tracked per source; a name absent
// for `vocab.window_days` (default 60) counts as novel again. The
// very first run only builds the vocabulary and flags nothing.
//
// Storage goes through an injectable IO seam (load/save/exists) so
// tests and hosts can keep the state wherever they like; the default
// implementation uses node:fs with the same on-disk format as Python
// (JSON, sorted keys, indent 1).

import * as fs from "node:fs";
import * as path from "node:path";
import type { RadarConfig, SourceResult } from "./types.js";

export const ENTITY_SOURCES: ReadonlySet<string> = new Set([
  "github", "huggingface", "hf_spaces", "openrouter",
  "civitai", "producthunt", "sitemaps", "app_store",
]);

export const DEFAULT_WINDOW_DAYS = 60;
export const DEFAULT_STATE_FILE = path.join("state", "vocab.json");

export interface VocabIo {
  exists(path: string): boolean;
  /** Parsed JSON object, or {} on any read/parse problem (like Python). */
  load(path: string): Record<string, unknown>;
  save(path: string, data: Record<string, string>): void;
}

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

function isoDateUTC(d: Date): string {
  // Python uses now.date() — the date in the datetime's own zone.
  // Callers pass UTC instants (scan stamps are UTC), so the UTC date
  // is the faithful equivalent.
  return d.toISOString().slice(0, 10);
}

export type VocabStats =
  | { enabled: false }
  | { baseline: boolean; novel: number; size: number };

/**
 * Tag novel entity names in place; persist the vocabulary.
 * Returns stats for the report — or { enabled: false } when turned
 * off in config.
 */
export function applyVocab(
  results: SourceResult[],
  config: RadarConfig,
  now: Date,
  io: VocabIo = fsVocabIo,
): VocabStats {
  const cfg = config?.vocab ?? {};
  if (cfg.enabled === false) return { enabled: false };
  const window = Math.trunc(Number(cfg.window_days ?? DEFAULT_WINDOW_DAYS));
  const statePath = cfg.state_file ?? DEFAULT_STATE_FILE;
  const baseline = !io.exists(statePath);
  const today = isoDateUTC(now);
  const horizon = isoDateUTC(new Date(now.getTime() - window * 86_400_000));
  const vocab = new Map<string, string>();
  for (const [k, v] of Object.entries(io.load(statePath))) {
    if (String(v) >= horizon) vocab.set(k, String(v));
  }
  let novel = 0;
  for (const result of results) {
    if (!ENTITY_SOURCES.has(result.source)) continue;
    for (const item of result.items) {
      const key = `${result.source}:${(item.name ?? "").trim().toLowerCase()}`;
      if (!vocab.has(key) && !baseline) {
        item.novel = true;
        novel += 1;
      }
      vocab.set(key, today);
    }
  }
  const sorted: Record<string, string> = {};
  for (const k of [...vocab.keys()].sort()) sorted[k] = vocab.get(k) as string;
  io.save(statePath, sorted);
  return { baseline, novel, size: vocab.size };
}
