// Topic identity and the track-record ledger, ported from
// radar/publish.py (`topic_key`, `build_topics`, `parse_track_record`).
// Editions must already carry _heat/_rank, attached by the load step
// exactly as publish.load() does (heat desc, stable order).

import * as fs from "node:fs";
import { classify, type CatRuleSet } from "./classify.js";
import { RESERVED_FILES, slugify } from "./slug.js";
import { publishTokens } from "./tokens.js";
import type { Edition, StoreTopic, Topic, TopicApp } from "./types.js";

/**
 * Map an edition item to its topic identity: hard-coded arcs first,
 * then a ledger match at >= 6 shared publish tokens, else its own
 * title. Note the case-sensitive "Nvidia" check — "NVIDIA" does not
 * match, exactly as in Python.
 */
export function topicKey(
  it: { title?: string | null },
  ledger: Pick<StoreTopic, "name">[],
): [string, string] {
  const title = it.title ?? "";
  if (title.includes("Anthropic")) return ["arc:anthropic", "Anthropic IPO"];
  if (["黄仁勋", "英伟达", "Nvidia"].some((k) => title.includes(k))) {
    return ["arc:nvidia", "黄仁勋 / Nvidia 风波"];
  }
  const tt = publishTokens(title);
  let best: Pick<StoreTopic, "name"> | null = null;
  let bestN = 0;
  for (const t of ledger) {
    let n = 0;
    for (const tok of publishTokens(t.name)) if (tt.has(tok)) n += 1;
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  if (best !== null && bestN >= 6) return [`led:${best.name}`, best.name];
  return [`own:${title}`, title];
}

export function buildTopics(
  editions: Edition[],
  ledger: Pick<StoreTopic, "name">[],
  catRules?: CatRuleSet,
): Topic[] {
  const topics = new Map<string, Topic>();
  const order: string[] = [];
  editions.forEach((ed, ei) => {
    for (const it of ed.items) {
      const [key, name] = topicKey(it, ledger);
      let t = topics.get(key);
      if (!t) {
        t = { key, name, apps: [], id: "", slug: "" };
        topics.set(key, t);
        order.push(key);
      }
      const app: TopicApp = {
        edition: ei,
        date: ed.date,
        slot: ed.slot ?? null,
        published: ed.published_at ?? null,
        category: classify(it.title ?? "", it.body ?? "", catRules),
        title: it.title ?? name,
        level: it.level === "seed" ? "echo" : (it.level ?? null), // legacy "seed" normalizes to "echo"
        heat: it._heat,
        rank: it._rank,
        sources: it.sources ?? [],
        links: it.links ?? [],
        body: it.body ?? "",
        action: it.action ?? "",
        // Only carried when the edition actually has translations, so
        // untranslated data keeps its exact pre-i18n shape.
        ...(it.i18n ? { i18n: it.i18n } : {}),
        is_new: Boolean(it.is_new),
        heat_delta: null,
        rank_delta: null,
      };
      t.apps.push(app);
    }
  });
  const usedSlugs = new Set<string>();
  order.forEach((key, idx) => {
    const t = topics.get(key) as Topic;
    t.id = `t${String(idx + 1).padStart(2, "0")}`;
    const base = slugify(t.apps[0].title, t.id);
    let slug = base;
    let n = 2;
    while (
      usedSlugs.has(slug) ||
      RESERVED_FILES.has(slug) ||
      slug.startsWith("edition-") ||
      slug.startsWith("category-") ||
      slug.startsWith("level-") ||
      slug.startsWith("board-")
    ) {
      slug = `${base}-${n}`;
      n += 1;
    }
    usedSlugs.add(slug);
    t.slug = slug;
    t.name = key.startsWith("arc:") ? t.name : t.apps[t.apps.length - 1].title;
    t.apps.forEach((app, j) => {
      if (j === 0) {
        app.heat_delta = null;
        app.rank_delta = null;
      } else {
        const prev = t.apps[j - 1];
        app.heat_delta = app.heat - prev.heat;
        app.rank_delta = prev.rank - app.rank;
      }
    });
  });
  return order.map((k) => topics.get(k) as Topic);
}

// ------------------------------------------------------------ track record

export const TRACK_LEVELS: Record<string, string> = {
  "🔥": "must",
  "👀": "watch",
  "🌱": "echo",
  "🌀": "echo",
};

export interface TrackEntry {
  level: string;
  emoji: string;
  topic: string;
  criteria: string;
  result: string;
  review_date: string;
}

export interface TrackGroup {
  date: string;
  label: string;
  review_date: string;
  entries: TrackEntry[];
}

export interface TrackData {
  groups: TrackGroup[];
  total: number;
  reviewed: number;
  hits: number;
  first_review: string;
}

function emptyTrackData(): TrackData {
  return { groups: [], total: 0, reviewed: 0, hits: 0, first_review: "" };
}

/**
 * Parse track-record.md content into structured data. The Markdown
 * stays the single source of truth: edition sections look like
 * `## 2026-11-11 试点期（复核日 2026-11-25）` followed by a table of
 * `| 级别 | 话题 | 复核标准 | 结果 |` rows. (Python takes a path;
 * here the pure function takes the text, and parseTrackRecordFile
 * covers the path-based use, including the missing-file case.)
 */
export function parseTrackRecord(markdown: string): TrackData {
  const data = emptyTrackData();
  let cur: TrackGroup | null = null;
  for (const ln of markdown.split(/\r\n|\r|\n/)) {
    const m = /^##\s+(\d{4}-\d{2}-\d{2})\s+(.+?)（复核日\s*(\d{4}-\d{2}-\d{2})）\s*$/.exec(ln);
    if (m) {
      cur = { date: m[1], label: m[2].trim(), review_date: m[3], entries: [] };
      data.groups.push(cur);
      continue;
    }
    if (cur === null || !ln.startsWith("|")) continue;
    const cells = ln
      .trim()
      .replace(/^\|+/, "")
      .replace(/\|+$/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.length !== 4 || !(cells[0] in TRACK_LEVELS)) continue;
    const entry: TrackEntry = {
      level: TRACK_LEVELS[cells[0]],
      emoji: cells[0],
      topic: cells[1],
      criteria: cells[2],
      result: cells[3],
      review_date: cur.review_date,
    };
    cur.entries.push(entry);
    data.total += 1;
    if (entry.result) {
      data.reviewed += 1;
      if (entry.result.includes("命中") && !entry.result.includes("未命中")) {
        data.hits += 1;
      }
    }
  }
  const dates = data.groups.filter((g) => g.entries.length > 0).map((g) => g.review_date);
  data.first_review = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : "";
  return data;
}

export function parseTrackRecordFile(filePath: string): TrackData {
  if (!fs.existsSync(filePath)) return emptyTrackData();
  return parseTrackRecord(fs.readFileSync(filePath, "utf-8"));
}
