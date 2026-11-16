// Site data for the P2 web app: the same inputs the static publisher
// reads (editions/*.json + state/seen-topics.json + optional
// config.yaml), loaded through @breaker-delta/core so topic identity,
// heat and slugs are computed by exactly the same code. Board states
// (carried-forward valuation + rank/heat deltas) port build.ts's
// algorithm verbatim. Storage moves behind this module in P2b
// (SQLite/D1); pages only consume the shapes below.

import * as fs from "node:fs";
import * as path from "node:path";

import {
  buildTopics,
  catRulesFromConfig,
  heatOf,
  slugify,
  type Edition,
  type StoreTopic,
  type Topic,
  type TopicApp,
} from "@breaker-delta/core";
import { parseYaml } from "@breaker-delta/fetchers";
import { ARC_NAMES, CAT_KEYS } from "@breaker-delta/publisher";

import { loadPanelDefs, type PanelDef } from "./plugins";

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

const SLOT_ORDER: Record<string, number> = { pilot: 0, morning: 1, evening: 2 };

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

function loadEditions(dir: string): Edition[] {
  const edDir = path.join(dir, "editions");
  let names: string[] = [];
  try {
    names = fs.readdirSync(edDir).filter((n) => n.endsWith(".json"));
  } catch {
    names = [];
  }
  const keyed = names.map((n) => {
    const m = /(\d{4}-\d{2}-\d{2})-(\w+)/.exec(n);
    if (!m) throw new Error(`edition filename does not parse: ${n}`);
    return { n, date: m[1], order: SLOT_ORDER[m[2]] ?? 9 };
  });
  keyed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
  const editions: Edition[] = [];
  for (const { n } of keyed) {
    const ed = JSON.parse(fs.readFileSync(path.join(edDir, n), "utf-8")) as Edition;
    for (const it of ed.items) it._heat = heatOf(it);
    const ranked = [...ed.items].sort((a, b) => b._heat - a._heat);
    ranked.forEach((it, i) => {
      it._rank = i + 1;
    });
    editions.push(ed);
  }
  return editions;
}

function loadLedger(dir: string): StoreTopic[] {
  const p = path.join(dir, "state", "seen-topics.json");
  if (!fs.existsSync(p)) return [];
  const data = JSON.parse(fs.readFileSync(p, "utf-8")) as { topics?: StoreTopic[] };
  return data.topics ?? [];
}

function loadConfig(dir: string): Record<string, unknown> {
  const p = path.join(dir, "config.yaml");
  if (!fs.existsSync(p)) return {};
  return (parseYaml(fs.readFileSync(p, "utf-8")) ?? {}) as Record<string, unknown>;
}

/** Board states exactly as build.ts computes them: at each edition,
 * every topic known so far, valued at its most recent appearance. */
function boardStates(topics: Topic[], editionCount: number): Map<string, BoardState>[] {
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
  // Attach board ranks back onto appearances (topic page history).
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
  return states;
}

let cache: SiteData | null = null;

export function getSiteData(): SiteData {
  if (cache) return cache;
  const dir = dataDir();
  const config = loadConfig(dir);
  const editions = loadEditions(dir);
  const ledger = loadLedger(dir);
  const topics = buildTopics(editions, ledger, catRulesFromConfig(config) ?? undefined);
  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  const states = boardStates(topics, editions.length);
  const panelDefs = loadPanelDefs(engineDir(), dir, config);
  cache = { dataDir: dir, editions, topics, bySlug, states, panelDefs, config };
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
