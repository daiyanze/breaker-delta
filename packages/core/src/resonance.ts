// Cross-source resonance grouping, ported from radar/scan.py
// `resonance_groups`. Deliberately naive, like the original: a group
// is items from >= 2 sources sharing a distinctive scan token; a
// token shared by more than MAX_TOKEN_ITEMS items is a theme, not a
// name, and is dropped. Groups are deduplicated by their sorted item
// names, sorted by (-sources, -items, token) and capped at 60.

import { scanTokens } from "./tokens.js";
import type { CandidateItem, SourceResult } from "./types.js";

export const MAX_TOKEN_ITEMS = 12;
export const MAX_GROUPS = 60;

export interface ResonanceGroupItem {
  source: string;
  name: string;
  url: string;
}

export interface ResonanceGroup {
  token: string;
  sources: string[];
  items: ResonanceGroupItem[];
}

export function resonanceGroups(results: SourceResult[]): ResonanceGroup[] {
  const byToken = new Map<string, CandidateItem[]>();
  for (const result of results) {
    for (const item of result.items) {
      for (const tok of scanTokens(item.name)) {
        let arr = byToken.get(tok);
        if (!arr) {
          arr = [];
          byToken.set(tok, arr);
        }
        arr.push(item);
      }
    }
  }
  const groups: ResonanceGroup[] = [];
  const seen = new Set<string>();
  for (const [tok, items] of byToken) {
    const sources = new Set(items.map((i) => i.source));
    if (sources.size < 2 || items.length > MAX_TOKEN_ITEMS) continue;
    const key = JSON.stringify(items.map((i) => i.name).sort());
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({
      token: tok,
      sources: [...sources].sort(),
      items: items.map((i) => ({ source: i.source, name: i.name, url: i.url })),
    });
  }
  groups.sort(
    (a, b) =>
      b.sources.length - a.sources.length ||
      b.items.length - a.items.length ||
      (a.token < b.token ? -1 : a.token > b.token ? 1 : 0),
  );
  return groups.slice(0, MAX_GROUPS);
}
