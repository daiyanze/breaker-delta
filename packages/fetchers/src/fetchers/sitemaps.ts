// Directory sitemaps fetcher: new tools appearing in AI directories
// (L2). Ported from radar/fetchers/sitemaps.py. Snapshot diff: the
// fetcher keeps every tool-page URL seen per directory in
// state/sitemap-seen.json and only reports URLs not in the previous
// snapshot; a directory's first run only builds its baseline.
//
// State path semantics match Python: relative paths resolve against
// the working directory — here, the injectable baseDir option
// (opts.baseDir, default process.cwd()).

import * as fs from "node:fs";
import * as path from "node:path";
import { FetchError, getText, missing, ok } from "../common.js";
import type { CandidateItem } from "../common.js";
import { isoDateUTC } from "../py.js";
import { findText, iter, parseXml, XmlParseError } from "../xml.js";
import { asArray, asRecord, sourceCfg } from "./types.js";
import type { FetcherFn, FetchOpts } from "./types.js";

export const SOURCE = "sitemaps";
export const LAYER = 2;

const SM = "{http://www.sitemaps.org/schemas/sitemap/0.9}";

export const RETENTION_DAYS = 90;

export interface SiteDef {
  name: string;
  url: string;
  pattern: string;
  skip?: string;
  max_age_days?: number;
  limit?: number;
  shard_pattern?: string;
  shard_patterns?: string[];
  shards_to_read?: number;
  [key: string]: unknown;
}

export const DEFAULT_SITES: SiteDef[] = [
  {
    name: "futurepedia",
    url: "https://www.futurepedia.io/sitemap_tools.xml",
    pattern: "/tool/([^/]+)$",
    max_age_days: 7,
  },
  {
    name: "toolify",
    url: "https://www.toolify.ai/sitemap.xml",
    shard_pattern: "sitemap_tools_(\\d+)\\.xml$",
    shards_to_read: 1,
    pattern: "toolify\\.ai/tool/([^/]+)/?$",
  },
  {
    name: "dang.ai",
    url: "https://dang.ai/sitemap.xml",
    pattern: "dang\\.ai/([^/]+)$",
    skip: "^(about|advertise|blog|pricing|login|signup)$",
  },
];

function slugName(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // Python unquote leaves bad % sequences as-is; keep the raw slug.
  }
  return decoded.replace(/[-_/]+/g, " ").trim();
}

export function parseIndex(xmlText: string, shardPattern: string): string[] {
  const root = parseXml(xmlText);
  const re = new RegExp(shardPattern);
  const entries: { key: number | null; idx: number; loc: string }[] = [];
  let idx = 0;
  for (const node of iter(root, `${SM}sitemap`)) {
    const loc = findText(node, `${SM}loc`) ?? "";
    const m = re.exec(loc);
    if (m) {
      const key = m[1] !== undefined && /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : null;
      entries.push({ key, idx, loc });
    }
    idx += 1;
  }
  if (entries.length > 0 && entries.every((e) => e.key !== null)) {
    entries.sort((a, b) => (a.key as number) - (b.key as number) || a.idx - b.idx);
  }
  return entries.map((e) => e.loc);
}

function parseLastmod(raw: string): Date | null {
  try {
    const iso = raw.replace("Z", "+00:00");
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

export function parseUrlset(
  xmlText: string,
  site: SiteDef,
  now: Date,
  cap = true,
): CandidateItem[] {
  const pattern = new RegExp(site.pattern);
  const skip = site.skip ? new RegExp(`^(?:${site.skip})`) : null;
  const maxAge = site.max_age_days;
  const cutoff = maxAge ? new Date(now.getTime() - maxAge * 86_400_000) : null;
  const entries: { lastmod: Date | null; item: CandidateItem }[] = [];
  const root = parseXml(xmlText);
  for (const node of iter(root, `${SM}url`)) {
    const loc = findText(node, `${SM}loc`) ?? "";
    const m = pattern.exec(loc);
    if (!m) continue;
    const slug = m[1];
    if (skip && skip.test(slug)) continue;
    const lastmodRaw = findText(node, `${SM}lastmod`);
    let lastmod: Date | null = null;
    if (lastmodRaw) lastmod = parseLastmod(lastmodRaw);
    if (cutoff && lastmod && lastmod < cutoff) continue;
    entries.push({
      lastmod,
      item: {
        source: SOURCE,
        name: slugName(slug),
        url: loc,
        metrics: {
          directory: site.name,
          lastmod: lastmod ? isoDateUTC(lastmod) : null,
        },
        detail: "",
      },
    });
  }
  const MIN_TIME = -62135596800000; // datetime.min with UTC tz, approx
  entries.sort(
    (a, b) => (b.lastmod?.getTime() ?? MIN_TIME) - (a.lastmod?.getTime() ?? MIN_TIME),
  );
  const items = entries.map((e) => e.item);
  return cap ? items.slice(0, site.limit ?? 20) : items;
}

export function diffItems(
  items: CandidateItem[],
  seen: Record<string, string>,
  now: Date,
): { fresh: CandidateItem[]; updated: Record<string, string>; baseline: boolean } {
  const baseline = Object.keys(seen).length === 0;
  const today = isoDateUTC(now);
  const updated: Record<string, string> = { ...seen };
  const fresh: CandidateItem[] = [];
  for (const item of items) {
    const url = item.url;
    if (!(url in updated)) {
      updated[url] = today;
      if (!baseline) fresh.push(item);
    }
  }
  const current = new Set(items.map((i) => i.url));
  const horizon = isoDateUTC(new Date(now.getTime() - RETENTION_DAYS * 86_400_000));
  const pruned: Record<string, string> = {};
  for (const [url, first] of Object.entries(updated)) {
    if (current.has(url) || first >= horizon) pruned[url] = first;
  }
  return { fresh, updated: pruned, baseline };
}

function loadState(statePath: string): Record<string, Record<string, string>> {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    return data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, Record<string, string>>)
      : {};
  } catch {
    return {};
  }
}

function saveState(statePath: string, state: Record<string, Record<string, string>>): void {
  fs.mkdirSync(path.dirname(statePath) || ".", { recursive: true });
  const sorted: Record<string, Record<string, string>> = {};
  for (const k of Object.keys(state).sort()) {
    const inner: Record<string, string> = {};
    for (const ik of Object.keys(state[k]).sort()) inner[ik] = state[k][ik];
    sorted[k] = inner;
  }
  fs.writeFileSync(statePath, JSON.stringify(sorted, null, 1), "utf-8");
}

async function siteItems(site: SiteDef, now: Date): Promise<CandidateItem[]> {
  const xml = await getText(site.url);
  const root = parseXml(xml);
  if (root.local !== "sitemapindex") {
    return parseUrlset(xml, site, now, false);
  }
  const patterns = site.shard_patterns ?? [site.shard_pattern ?? "\\.xml$"];
  const take = site.shards_to_read ?? 1;
  const items: CandidateItem[] = [];
  for (const pattern of patterns) {
    const shards = parseIndex(xml, pattern).slice(-take);
    for (const shardUrl of shards) {
      items.push(...parseUrlset(await getText(shardUrl), site, now, false));
    }
  }
  return items;
}

export const fetch: FetcherFn = async (config, now, opts?: FetchOpts) => {
  const when = now ?? new Date();
  const cfg = sourceCfg(config, "sitemaps");
  const sites = (cfg["sites"] as SiteDef[] | undefined) ?? DEFAULT_SITES;
  const baseDir = opts?.baseDir ?? process.cwd();
  const stateRel = (cfg["state_file"] as string | undefined) ?? "state/sitemap-seen.json";
  const statePath = path.isAbsolute(stateRel) ? stateRel : path.join(baseDir, stateRel);
  const state = loadState(statePath);
  const items: CandidateItem[] = [];
  const failed: string[] = [];
  const baselines: string[] = [];
  let succeeded = 0;
  for (const siteRaw of sites) {
    const site = asRecord(siteRaw) as unknown as SiteDef;
    let collected: CandidateItem[];
    try {
      collected = await siteItems(site, when);
    } catch (err) {
      if (err instanceof FetchError || err instanceof XmlParseError) {
        failed.push(site.name);
        continue;
      }
      throw err;
    }
    succeeded += 1;
    const { fresh, updated, baseline } = diffItems(
      collected,
      state[site.name] ?? {},
      when,
    );
    state[site.name] = updated;
    if (baseline) baselines.push(`${site.name}(${Object.keys(updated).length})`);
    items.push(...fresh.slice(0, site.limit ?? 20));
  }
  void asArray;
  if (succeeded > 0) saveState(statePath, state);
  const notes: string[] = [];
  if (failed.length > 0) notes.push(`failed sites: ${failed.join(", ")}`);
  if (baselines.length > 0) {
    notes.push(`baseline built (first run, nothing reported): ${baselines.join(", ")}`);
  }
  if (succeeded === 0) {
    return missing(SOURCE, LAYER, `all sitemaps failed: ${failed.join(", ")}`);
  }
  return ok(SOURCE, LAYER, items, notes.join("; "));
};
