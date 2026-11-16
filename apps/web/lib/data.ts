// Site data assembly for the web app: a store backend (files or
// SQLite/D1 — see store.ts) supplies editions + ledger + config +
// optionally precomputed topics; this module derives the board
// states every page renders from. Board states are computed
// incrementally (one pass over editions, carrying each topic's
// latest appearance forward); boardStatesNaive keeps the original
// per-edition full scan as the reference implementation the import
// verifier cross-checks against.

import * as path from "node:path";

import {
  buildTopics,
  catRulesFromConfig,
  type Edition,
  type Topic,
  type TopicApp,
} from "@breaker-delta/core";
import { ARC_NAMES, CAT_KEYS } from "@breaker-delta/publisher";
import { slugify } from "@breaker-delta/core";

import { loadPanelDefs, type PanelDef } from "./plugins";
import { FileStore, SqliteStore, type SiteStore } from "./store";

export const LANGS = ["zh", "en", "ja"] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(x: string): x is Lang {
  return (LANGS as readonly string[]).includes(x);
}

export interface BoardState {
  topic: Topic;
  app: TopicApp;
  heat: number;
  carried: boolean;
  rank: number;
  heatDelta: number | null;
  rankDelta: number | null;
}

export interface SiteData {
  dataDir: string;
  editions: Edition[];
  topics: Topic[];
  bySlug: Map<string, Topic>;
  /** Board state per edition index, keyed by topic key. */
  states: Map<string, BoardState>[];
  panelDefs: PanelDef[];
  config: Record<string, unknown>;
}

function dataDir(): string {
  if (process.env.BD_DATA_DIR) return path.resolve(process.env.BD_DATA_DIR);
  // apps/web -> repo root is ../.. ; the official data checkout is a
  // sibling of the engine repo.
  return path.resolve(process.cwd(), "../../../breaker-delta-data");
}

function engineDir(): string {
  if (process.env.BD_ENGINE_DIR) return path.resolve(process.env.BD_ENGINE_DIR);
  return path.resolve(process.cwd(), "../..");
}

function pickStore(): SiteStore {
  if (process.env.BD_DB_PATH) return new SqliteStore(path.resolve(process.env.BD_DB_PATH));
  return new FileStore(dataDir());
}

function attachBoardRanks(topics: Topic[], states: Map<string, BoardState>[]): void {
  for (const t of topics) {
    let prevBr: number | null = null;
    for (const a of t.apps) {
      const st = states[a.edition]?.get(t.key);
      (a as TopicApp & { board_rank?: number }).board_rank = st ? st.rank : a.rank;
      (a as TopicApp & { board_rank_delta?: number | null }).board_rank_delta =
        prevBr !== null ? prevBr - ((a as TopicApp & { board_rank?: number }).board_rank as number) : null;
      prevBr = (a as TopicApp & { board_rank?: number }).board_rank as number;
    }
  }
}

/** Incremental board states: a single pass over editions. Each
 * edition updates only the topics it touches; the snapshot ranks the
 * carried-forward board. Output is identical to boardStatesNaive
 * (the import verifier proves it on the real data). */
export function boardStates(topics: Topic[], editionCount: number): Map<string, BoardState>[] {
  const appsAt: [Topic, TopicApp][][] = Array.from({ length: editionCount }, () => []);
  for (const t of topics) {
    for (const a of t.apps) {
      if (a.edition >= 0 && a.edition < editionCount) appsAt[a.edition].push([t, a]);
    }
  }
  const states: Map<string, BoardState>[] = [];
  const cur = new Map<string, BoardState>();
  let prev = new Map<string, { heat: number; rank: number }>();
  for (let ei = 0; ei < editionCount; ei++) {
    for (const [t, a] of appsAt[ei]) {
      cur.set(t.key, {
        topic: t,
        app: a,
        heat: a.heat,
        carried: false,
        rank: 0,
        heatDelta: null,
        rankDelta: null,
      });
    }
    const snap = new Map<string, BoardState>();
    for (const [k, st] of cur) snap.set(k, { ...st, carried: st.app.edition !== ei });
    const ranked = [...snap.values()].sort((x, y) => y.heat - x.heat);
    ranked.forEach((st, i) => {
      st.rank = i + 1;
      const pa = prev.get(st.topic.key);
      st.heatDelta = pa ? st.heat - pa.heat : null;
      st.rankDelta = pa ? pa.rank - st.rank : null;
    });
    states.push(snap);
    prev = new Map([...snap].map(([k, v]) => [k, { heat: v.heat, rank: v.rank }] as const));
  }
  attachBoardRanks(topics, states);
  return states;
}

/** Reference implementation (build.ts's original algorithm): at each
 * edition, every topic known so far, valued at its most recent
 * appearance. Kept for verification, not used by pages. */
export function boardStatesNaive(topics: Topic[], editionCount: number): Map<string, BoardState>[] {
  const states: Map<string, BoardState>[] = [];
  let prev = new Map<string, { heat: number; rank: number }>();
  for (let ei = 0; ei < editionCount; ei++) {
    const cur = new Map<string, BoardState>();
    for (const t of topics) {
      const appsLe = t.apps.filter((a) => a.edition <= ei);
      if (appsLe.length === 0) continue;
      const a = appsLe[appsLe.length - 1];
      cur.set(t.key, {
        topic: t,
        app: a,
        heat: a.heat,
        carried: a.edition !== ei,
        rank: 0,
        heatDelta: null,
        rankDelta: null,
      });
    }
    const ranked = [...cur.values()].sort((x, y) => y.heat - x.heat);
    ranked.forEach((st, i) => {
      st.rank = i + 1;
      const pa = prev.get(st.topic.key);
      st.heatDelta = pa ? st.heat - pa.heat : null;
      st.rankDelta = pa ? pa.rank - st.rank : null;
    });
    const byKey = new Map<string, BoardState>();
    for (const st of ranked) byKey.set(st.topic.key, st);
    states.push(byKey);
    prev = new Map([...byKey].map(([k, v]) => [k, { heat: v.heat, rank: v.rank }] as const));
  }
  attachBoardRanks(topics, states);
  return states;
}

let cache: Promise<SiteData> | null = null;

export function getSiteData(): Promise<SiteData> {
  if (cache) return cache;
  cache = (async () => {
    const stored = await pickStore().load();
    const dir = dataDir();
    const topics =
      stored.topics ??
      buildTopics(stored.editions, stored.ledger, catRulesFromConfig(stored.config) ?? undefined);
    const bySlug = new Map(topics.map((t) => [t.slug, t]));
    const states = boardStates(topics, stored.editions.length);
    const panelDefs = loadPanelDefs(engineDir(), dir, stored.config);
    return {
      dataDir: dir,
      editions: stored.editions,
      topics,
      bySlug,
      states,
      panelDefs,
      config: stored.config,
    };
  })();
  return cache;
}

/** Latest board, ranked. */
export function latestBoard(data: SiteData): BoardState[] {
  const st = data.states[data.states.length - 1];
  if (!st) return [];
  return [...st.values()].sort((x, y) => x.rank - y.rank);
}

/* ---- localization (mirrors publisher render.ts) ---- */

export interface LocText {
  title: string;
  body: string;
  action: string;
}

export function locApp(app: TopicApp, lang: Lang): LocText {
  const t = app.i18n?.[lang];
  return {
    title: t?.title || app.title,
    body: t?.body || app.body,
    action: t?.action || app.action,
  };
}

export function locTopicName(topic: Topic, lang: Lang): string {
  if (lang !== "zh") {
    const arc = ARC_NAMES[topic.name]?.[lang];
    if (arc) return arc;
  }
  const named = topic.apps.find((a) => a.title === topic.name);
  const last = topic.apps[topic.apps.length - 1];
  return locApp(named ?? last, lang).title;
}

export function catKey(cat: string): string {
  return Object.prototype.hasOwnProperty.call(CAT_KEYS, cat)
    ? CAT_KEYS[cat]
    : slugify(cat, "category");
}

/** All categories present in the latest appearances, with topic counts. */
export function categoryIndex(data: SiteData): { name: string; key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const st of latestBoard(data)) {
    counts.set(st.app.category, (counts.get(st.app.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, key: catKey(name), count }))
    .sort((a, b) => b.count - a.count);
}
