// Static data layer payloads, ported from radar/publish.py
// (`topics_data`, `alerts_data`) — the data/topics.json and
// data/alerts.json the browser extension consumes.

import { titleKeywords } from "./slug.js";
import type { Edition, Topic } from "./types.js";

export interface TopicDataEntry {
  slug: string;
  title: string;
  heat: number;
  first_seen: string;
  level: string | null;
  url_patterns: string[];
  title_keywords: string[];
  /** Plugin data from the latest appearance's plugins namespace
   *  (Plugin-P2: scores, entities, grading output) — the consumer
   *  contract for the extension and other data readers. Absent
   *  when no plugin stored anything for the topic. */
  plugins?: Record<string, Record<string, unknown>>;
}

export interface TopicsData {
  generated_at: string | null;
  topics: TopicDataEntry[];
}

/** netloc + path of a URL, trailing "/" stripped — Python urlparse. */
function urlPattern(u: string): string {
  let netloc = "";
  let rest = u;
  const m = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(u);
  if (m) {
    netloc = m[1];
    rest = u.slice(m[0].length);
  } else if (u.startsWith("//")) {
    const m2 = /^\/\/([^/?#]*)/.exec(u);
    if (m2) {
      netloc = m2[1];
      rest = u.slice(m2[0].length);
    }
  }
  const pathPart = rest.split(/[?#]/)[0];
  return (netloc + pathPart).replace(/\/+$/, "");
}

/** data/topics.json payload: every current topic, extension fields. */
export function topicsData(editions: Edition[], topics: Topic[]): TopicsData {
  const out: TopicDataEntry[] = [];
  for (const t of topics) {
    const last = t.apps[t.apps.length - 1];
    const first = t.apps[0];
    const patterns: string[] = [];
    const seen = new Set<string>();
    for (const a of t.apps) {
      for (const u of a.links) {
        const pat = urlPattern(u);
        if (pat && !seen.has(pat)) {
          seen.add(pat);
          patterns.push(pat);
        }
      }
    }
    out.push({
      slug: t.slug,
      title: t.name,
      heat: last.heat,
      first_seen: first.date,
      level: last.level,
      url_patterns: patterns,
      title_keywords: titleKeywords(t.name),
      ...(last.plugins ? { plugins: last.plugins } : {}),
    });
  }
  const gen = editions.length > 0 ? (editions[editions.length - 1].published_at ?? null) : "";
  return { generated_at: gen, topics: out };
}

export interface AlertEntry {
  topic_slug: string;
  title: string;
  reason: "resonance" | "surge";
  heat_before: number;
  heat_after: number;
  edition: string;
  triggered_at: string;
  dedupe_key: string;
}

export interface AlertsData {
  generated_at: string;
  alerts: AlertEntry[];
}

/**
 * data/alerts.json payload: deterministic alerts for the latest
 * edition. resonance = topic first seen in the latest edition with
 * >= 2 independent sources; surge = board heat gain >= 30 versus
 * the previous time point, existing topics only (a topic new to
 * the board reports resonance only, never surge).
 */
export function alertsData(editions: Edition[], topics: Topic[]): AlertsData {
  if (editions.length === 0) return { generated_at: "", alerts: [] };
  const latestEi = editions.length - 1;
  const latest = editions[latestEi];
  const gen = latest.published_at || "";
  const slot = latest.slot === null || latest.slot === undefined ? "None" : latest.slot;
  const edKey = `${latest.date}-${slot}`;
  // Board states, carried forward like the board itself.
  const states: Map<string, number>[] = [];
  for (let ei = 0; ei < editions.length; ei++) {
    const cur = new Map<string, number>();
    for (const t of topics) {
      const appsLe = t.apps.filter((a) => a.edition <= ei);
      if (appsLe.length > 0) cur.set(t.key, appsLe[appsLe.length - 1].heat);
    }
    states.push(cur);
  }
  const prevState = states.length >= 2 ? states[states.length - 2] : new Map<string, number>();
  const byKey = new Map(topics.map((t) => [t.key, t]));
  const alerts: AlertEntry[] = [];
  const seenKeys = new Set<string>();
  const add = (t: Topic, reason: "resonance" | "surge", before: number, after: number): void => {
    const dk = `${t.slug}:${reason}:${edKey}`;
    if (seenKeys.has(dk)) return;
    seenKeys.add(dk);
    alerts.push({
      topic_slug: t.slug,
      title: t.name,
      reason,
      heat_before: before,
      heat_after: after,
      edition: gen,
      triggered_at: gen,
      dedupe_key: dk,
    });
  };
  for (const t of topics) {
    const first = t.apps[0];
    if (first.edition === latestEi && first.sources.length >= 2) {
      add(t, "resonance", 0, first.heat);
    }
  }
  for (const [key, heat] of states[states.length - 1]) {
    const before = prevState.get(key);
    if (before === undefined) continue; // new to the board: resonance only
    if (heat - before >= 30) add(byKey.get(key) as Topic, "surge", before, heat);
  }
  alerts.sort((a, b) =>
    a.topic_slug < b.topic_slug
      ? -1
      : a.topic_slug > b.topic_slug
        ? 1
        : a.reason < b.reason
          ? -1
          : a.reason > b.reason
            ? 1
            : 0,
  );
  return { generated_at: gen, alerts };
}
