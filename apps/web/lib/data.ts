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

import {
  loadEntityPluginIds,
  loadPanelDefs,
  loadScoreDescriptors,
  type PanelDef,
} from "./plugins";
import { fmt, s } from "./strings";
import { FileStore, SqliteStore, loadPluginPagesFromDir, type SiteStore } from "./store";
import { RemoteStore } from "./store-remote";

export const LANGS = ["zh", "en", "ja"] as const;
export type Lang = (typeof LANGS)[number];

/** Core types, re-exported so pages/components import everything
 * data-shaped from one module. */
export type { Edition, Topic, TopicApp } from "@breaker-delta/core";

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
  /** Enabled score plugins' display descriptors (Plugin-P1). */
  scorePlugins: import("./plugins").ScoreDescriptor[];
  /** Enabled entity-extraction plugin ids (Plugin-P2). */
  entityPlugins: string[];
  /** Plugin page data (Plugin-P2) from the active store. */
  pluginPages: import("@breaker-delta/publisher").PluginPageData[];
  config: Record<string, unknown>;
  configText: string | null;
  trackRecord: string | null;
}

export function dataDir(): string {
  if (process.env.BD_DATA_DIR) return path.resolve(process.env.BD_DATA_DIR);
  // apps/web -> repo root is ../.. ; the official data checkout is a
  // sibling of the engine repo.
  return path.resolve(process.cwd(), "../../../breaker-delta-data");
}

/** Plugin page tabs for the masthead (Plugin-P2): read straight
 *  from the data dir so the (synchronous) Mast component can show
 *  them without a store round-trip. The remote backend has no
 *  plugin pages yet; the plugin route itself reads the store. */
export function pluginPageTabsSync(): import("@breaker-delta/publisher").PluginPageData[] {
  if (remoteBase()) return [];
  try {
    return loadPluginPagesFromDir(dataDir());
  } catch {
    return [];
  }
}

/** The SQLite path when the DB backend is selected, else null. */
export function dbPath(): string | null {
  return process.env.BD_DB_PATH ? path.resolve(process.env.BD_DB_PATH) : null;
}

function engineDir(): string {
  if (process.env.BD_ENGINE_DIR) return path.resolve(process.env.BD_ENGINE_DIR);
  return path.resolve(process.cwd(), "../..");
}

/** The remote data base URL when the fetch backend is selected. */
export function remoteBase(): string | null {
  return process.env.BD_DATA_BASE ? process.env.BD_DATA_BASE.replace(/\/+$/, "") : null;
}

function pickStore(): SiteStore {
  const remote = remoteBase();
  if (remote) return new RemoteStore(remote);
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
let cacheAt = 0;

/** Drop the memoized site data (after a push wrote new data). */
export function invalidateSiteData(): void {
  cache = null;
}

/** How long assembled site data may be reused. File/SQLite data
 * changes only through this process (push API invalidates), so it
 * is cached indefinitely; the remote backend polls its repo on a
 * TTL so new editions appear without a redeploy. */
function cacheTtlMs(): number {
  if (!remoteBase()) return Number.POSITIVE_INFINITY;
  const n = Number(process.env.BD_DATA_TTL_MS ?? 120000);
  return Number.isFinite(n) && n > 0 ? n : 120000;
}

export function getSiteData(): Promise<SiteData> {
  if (cache && Date.now() - cacheAt < cacheTtlMs()) return cache;
  cacheAt = Date.now();
  cache = (async () => {
    const stored = await pickStore().load();
    const dir = remoteBase() ?? dataDir();
    const topics =
      stored.topics ??
      buildTopics(stored.editions, stored.ledger, catRulesFromConfig(stored.config) ?? undefined);
    const bySlug = new Map(topics.map((t) => [t.slug, t]));
    const states = boardStates(topics, stored.editions.length);
    const panelDefs = loadPanelDefs(engineDir(), dir, stored.config);
    const scorePlugins = loadScoreDescriptors(engineDir(), dir, stored.config);
    const entityPlugins = loadEntityPluginIds(engineDir(), dir, stored.config);
    return {
      dataDir: dir,
      editions: stored.editions,
      topics,
      bySlug,
      states,
      panelDefs,
      scorePlugins,
      entityPlugins,
      pluginPages: stored.pluginPages,
      config: stored.config,
      configText: stored.configText,
      trackRecord: stored.trackRecord,
    };
  })();
  // A failed load (e.g. a network blip on the remote backend) must
  // not poison the cache for the whole TTL — drop it so the next
  // request retries.
  cache.catch(() => {
    cache = null;
  });
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

/* ---- page helpers (mirroring publisher render.ts / ctx.ts) ---- */

import {
  CAT_I18N,
  LEVEL_I18N,
  SLOT_LABEL_I18N,
  SOURCE_DOMAINS,
  SRC_NAMES,
} from "@breaker-delta/publisher";
import { RESERVED_FILES } from "@breaker-delta/core";

/** "YYYY-MM-DD HH:MM" for an edition (edLabel in render.ts). */
export function edLabel(ed: Edition): string {
  const pa = ed.published_at ?? "";
  if ([...pa].length >= 16) return `${[...pa].slice(0, 10).join("")} ${[...pa].slice(11, 16).join("")}`;
  return ed.date;
}

const SLOT_ZH: Record<string, string> = { pilot: "试跑", morning: "早报", evening: "晚报" };

export function slotLabel(ed: Edition, lang: Lang): string {
  if (ed.slot != null && SLOT_LABEL_I18N[ed.slot]) {
    return SLOT_LABEL_I18N[ed.slot][lang] || SLOT_ZH[ed.slot] || ed.slot;
  }
  return ed.slot != null ? (SLOT_ZH[ed.slot] ?? ed.slot) : "";
}

/** Category display name in a language (catName in ctx.ts): the
 * instance's own category i18n first, then the built-in table. */
export function catNameOf(data: SiteData, cat: string, lang: Lang): string {
  if (lang === "zh") return cat;
  const rules = catRulesFromConfig(data.config);
  return rules?.i18n?.[cat]?.[lang] ?? CAT_I18N[cat]?.[lang] ?? cat;
}

export function levelLabelOf(level: string | null | undefined, lang: Lang): string {
  const table = (level != null ? LEVEL_I18N[level] : undefined) ?? LEVEL_I18N["echo"];
  return table[lang];
}

export function srcNameOf(name: string, lang: Lang): string {
  if (lang === "zh") return name;
  return SRC_NAMES[name]?.[lang] || name;
}

/** Row timestamp: "MM-DD HH:MM" from published, else "MM-DD". */
export function tstamp(app: TopicApp): string {
  const p = app.published ?? "";
  const chars = [...p];
  if (chars.length >= 16) return `${chars.slice(5, 10).join("")} ${chars.slice(11, 16).join("")}`;
  return [...(app.date ?? "")].slice(5).join("");
}

interface IsoParts {
  ms: number;
  aware: boolean;
}

function parseIso(s: string): IsoParts | null {
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return { ms, aware: /([zZ]|[+-]\d{2}:?\d{2})$/.test(s.trim()) };
}

/** Mini-chart points for a board row (trendPoints in render.ts):
 * appearances within 24h before the row's appearance; falls back to
 * the recent appearances when sparse. */
export function trendPoints(topic: Topic, app: TopicApp): number[] {
  const apps = topic.apps.filter((a) => a.edition <= app.edition);
  try {
    const t1 = parseIso(app.published ?? "");
    if (t1 === null) throw new Error("unparseable");
    const win: TopicApp[] = [];
    for (const a of apps) {
      if (!a.published) continue;
      const t = parseIso(a.published);
      if (t === null) throw new Error("unparseable");
      if (t.aware !== t1.aware) throw new Error("naive/aware mix");
      if ((t1.ms - t.ms) / 1000 <= 86400) win.push(a);
    }
    if (win.length >= 2) return win.map((a) => a.heat);
  } catch {
    /* fall through to the sparse fallback */
  }
  return apps.slice(-6).map((a) => a.heat);
}

/* ---- source statistics (sstat in build.ts) ---- */

export interface SourceStat {
  apps: number;
  topics: Map<string, Topic>;
  lastEi: number;
  firstEi: number;
  eds: Set<number>;
  topicApps: Map<string, number>;
  topicLast: Map<string, number>;
}

export interface SourceIndex {
  stats: Map<string, SourceStat>;
  /** Route base per source ("source-<slug>"), collision-suffixed
   * exactly like the static SRC_FILES assignment. */
  fileBase: Map<string, string>;
  byBase: Map<string, string>;
}

export function sourceIndex(data: SiteData): SourceIndex {
  const stats = new Map<string, SourceStat>();
  for (const t of data.topics) {
    for (const a of t.apps) {
      for (const src of a.sources) {
        let e = stats.get(src);
        if (!e) {
          e = {
            apps: 0,
            topics: new Map(),
            lastEi: -1,
            firstEi: 10 ** 9,
            eds: new Set(),
            topicApps: new Map(),
            topicLast: new Map(),
          };
          stats.set(src, e);
        }
        e.apps += 1;
        e.topics.set(t.slug, t);
        e.lastEi = Math.max(e.lastEi, a.edition);
        e.firstEi = Math.min(e.firstEi, a.edition);
        e.eds.add(a.edition);
        e.topicApps.set(t.slug, (e.topicApps.get(t.slug) ?? 0) + 1);
        e.topicLast.set(t.slug, Math.max(e.topicLast.get(t.slug) ?? -1, a.edition));
      }
    }
  }
  const fileBase = new Map<string, string>();
  const byBase = new Map<string, string>();
  const used = new Set<string>(RESERVED_FILES);
  for (const src of stats.keys()) {
    const base = "source-" + slugify(src, "src");
    let fn = base + ".html";
    let n = 2;
    while (used.has(fn)) {
      fn = `${base}-${n}.html`;
      n += 1;
    }
    used.add(fn);
    const b = fn.replace(/\.html$/, "");
    fileBase.set(src, b);
    byBase.set(b, src);
  }
  return { stats, fileBase, byBase };
}

/** The sources pages' stats line (srcStats in build.ts). */
export function srcStatsText(data: SiteData, lang: Lang, e: SourceStat, src: string): string {
  return fmt(s(lang, "src_stats"), {
    dom: SOURCE_DOMAINS[src] ?? "—",
    a: e.topics.size,
    b: e.apps,
    c: e.eds.size,
    d: edLabel(data.editions[e.firstEi]),
    e: edLabel(data.editions[e.lastEi]),
  });
}

/** Rewrite the static build's relative .html links inside the
 * literals' long-form HTML (ABOUT / LANDING bodies) to web routes. */
export function rewriteLinks(html: string, lang: Lang): string {
  const page = (name: string): string => {
    if (name === "index") return `/${lang}`;
    if (name.startsWith("category-")) return `/${lang}/category/${name.slice(9)}`;
    if (name.startsWith("source-")) return `/${lang}/source/${name}`;
    if (name.startsWith("edition-")) return `/${lang}/edition/${name.slice(8)}`;
    if (name.startsWith("level-")) return `/${lang}/level/${name.slice(6)}`;
    if (name === "track-record") return `/${lang}/track-record`;
    return `/${lang}/${name}`;
  };
  return html
    .replace(/href="feed\.xml"/g, `href="${lang === "zh" ? "/feed.xml" : `/${lang}/feed.xml`}"`)
    .replace(/href="atom\.xml"/g, `href="${lang === "zh" ? "/atom.xml" : `/${lang}/atom.xml`}"`)
    .replace(/href="([a-z0-9][a-z0-9-]*)\.html"/g, (_m, name: string) => `href="${page(name)}"`)
    .replace(
      /href="([^"]+?)\.html"/g,
      (_m, name: string) => `href="/${lang}/topic/${name}"`,
    );
}
