// User controls, ported from radar/scan.py (`topic_weights`,
// `item_time`, `apply_controls`). applyControls mutates the results
// in place, exactly like the Python version, and returns
// [stats, keywordAlerts].

import type { CandidateItem, RadarConfig, SourceResult } from "./types.js";

/**
 * Weighted relevance topics: config `topics` mapping preferred;
 * the legacy flat `grading.relevance_topics` list counts weight 1.
 * An empty `topics` dict falls through to the legacy list (Python
 * checks `isinstance(topics, dict) and topics`).
 */
export function topicWeights(config: RadarConfig): Record<string, number> {
  const topics = config?.topics;
  if (
    topics !== null &&
    typeof topics === "object" &&
    !Array.isArray(topics) &&
    Object.keys(topics as object).length > 0
  ) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(topics as Record<string, unknown>)) {
      out[String(k)] = v as number;
    }
    return out;
  }
  const legacy = config?.grading?.relevance_topics ?? [];
  const out: Record<string, number> = {};
  for (const t of legacy) out[String(t)] = 1;
  return out;
}

function parseIso(raw: string): Date | null {
  // Mirrors datetime.fromisoformat (after "Z" -> "+00:00"): naive
  // values are read as UTC, per the Python fallback that attaches
  // timezone.utc. Out-of-range components are rejected (JS Date
  // would otherwise roll them over; Python raises ValueError).
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/.exec(
      raw.trim(),
    );
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00", ss = "00", frac, tz] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +hh > 23 || +mm > 59 || +ss > 59) {
    return null;
  }
  let offset = "Z";
  if (tz && tz !== "Z") {
    offset = tz.includes(":") ? tz : `${tz.slice(0, 3)}:${tz.slice(3)}`;
  }
  const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}${frac ? `.${frac}` : ""}${offset}`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  if (!tz) {
    // UTC round-trip check: catches e.g. Feb 30 rolling into March.
    if (
      dt.getUTCFullYear() !== +y ||
      dt.getUTCMonth() !== +mo - 1 ||
      dt.getUTCDate() !== +d ||
      dt.getUTCHours() !== +hh ||
      dt.getUTCMinutes() !== +mm ||
      dt.getUTCSeconds() !== +ss
    ) {
      return null;
    }
  }
  return dt;
}

function parseRfc2822(raw: string): Date | null {
  // Python falls back to email.utils.parsedate_to_datetime; JS
  // Date.parse handles RFC 2822 date strings.
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * Best-effort publication time from a candidate's metrics
 * (published, then created, then pubDate). None is a valid answer —
 * the freshness filter must not punish sources for lacking one.
 */
export function itemTime(item: CandidateItem): Date | null {
  const metrics = item?.metrics ?? {};
  let raw: string | null = null;
  for (const key of ["published", "created", "pubDate"]) {
    const v = metrics[key];
    if (v) {
      raw = String(v);
      break;
    }
  }
  if (!raw) return null;
  return parseIso(raw) ?? parseRfc2822(raw);
}

export interface ControlsStats {
  muted: number;
  stale: number;
  boost_tagged: number;
  alert_tagged: number;
}

export interface KeywordAlert {
  source: string;
  name: string;
  url: string;
  keywords: string[];
}

/**
 * User controls (0.4.0), applied after fetching, before grouping.
 * Matching is case-insensitive substring over name + detail.
 * Mutates `results` in place; returns [stats, keywordAlerts].
 */
export function applyControls(
  results: SourceResult[],
  config: RadarConfig,
  now: Date,
): [ControlsStats, KeywordAlert[]] {
  const kw = config?.keywords ?? {};
  const mute = (kw.mute ?? []).map((k) => String(k).toLowerCase());
  const boost = (kw.boost ?? []).map((k) => String(k));
  const alert = (kw.alert ?? []).map((k) => String(k));
  const topics = topicWeights(config);
  const maxAge = (config?.filters ?? {}).max_age_hours;
  const stats: ControlsStats = { muted: 0, stale: 0, boost_tagged: 0, alert_tagged: 0 };
  const alerts: KeywordAlert[] = [];
  for (const result of results) {
    const kept: CandidateItem[] = [];
    for (const item of result.items) {
      const text = `${item.name ?? ""} ${item.detail ?? ""}`.toLowerCase();
      if (mute.some((k) => text.includes(k))) {
        stats.muted += 1;
        continue;
      }
      if (maxAge) {
        const when = itemTime(item);
        if (when && (now.getTime() - when.getTime()) / 1000 > Number(maxAge) * 3600) {
          stats.stale += 1;
          continue;
        }
      }
      const hitsBoost = boost.filter((k) => text.includes(k.toLowerCase()));
      const hitsAlert = alert.filter((k) => text.includes(k.toLowerCase()));
      const hitsTopics: Record<string, number> = {};
      for (const [t, w] of Object.entries(topics)) {
        if (text.includes(t.toLowerCase())) hitsTopics[t] = w;
      }
      if (hitsBoost.length > 0) {
        item.keyword_hits = { ...(item.keyword_hits ?? {}), boost: hitsBoost };
        stats.boost_tagged += 1;
      }
      if (hitsAlert.length > 0) {
        item.keyword_hits = { ...(item.keyword_hits ?? {}), alert: hitsAlert };
        stats.alert_tagged += 1;
        alerts.push({ source: item.source, name: item.name, url: item.url, keywords: hitsAlert });
      }
      if (Object.keys(hitsTopics).length > 0) {
        item.topic_hits = hitsTopics;
      }
      kept.push(item);
    }
    result.items = kept;
  }
  return [stats, alerts];
}
