// Pure, testable logic shared by the popup, the content script and
// the background service worker. Domain shapes come from
// @breaker-delta/core (the same types the publisher uses to generate
// data/topics.json and data/alerts.json); nothing here re-implements
// core's slugify / heat / tokenizers — the extension consumes the
// precomputed slug / heat / url_patterns / title_keywords fields.
// (Core is imported type-only: its index also pulls the store/vocab
// modules, which need node:fs/node:path and cannot run in a browser
// bundle. The one runtime rule mirrored here is the topic page file
// name, core slug.ts `topicFile`: `${slug}.html`.)

import type { AlertEntry, TopicDataEntry } from "@breaker-delta/core";

/** Published instance site the badge links to (zh root). */
export const SITE_BASE = "https://daiyanze.github.io/breaker-delta-data/";

/**
 * Canonical topic page URL: <site>/<slug>.html — the file name the
 * publisher writes for a topic (core `topicFile`), built from the
 * precomputed slug in topics.json (which carries no url field).
 */
export function topicPageUrl(topic: { slug: string }): string {
  return `${SITE_BASE}${topic.slug}.html`;
}

// ------------------------------------------------------------ data parsing

/** data/topics.json -> topic list; malformed payloads yield []. */
export function parseTopics(data: unknown): TopicDataEntry[] {
  const topics = (data as { topics?: unknown } | null | undefined)?.topics;
  return Array.isArray(topics) ? (topics as TopicDataEntry[]) : [];
}

/** data/alerts.json -> alert list; malformed payloads yield []. */
export function parseAlerts(data: unknown): AlertEntry[] {
  const alerts = (data as { alerts?: unknown } | null | undefined)?.alerts;
  return Array.isArray(alerts) ? (alerts as AlertEntry[]) : [];
}

// ------------------------------------------------------------ badge matching

/**
 * A page matches a topic when its URL contains any of the topic's
 * url_patterns, or its title/URL contains any title_keyword
 * (case-insensitive substring checks — the 0.2.x matching rule).
 */
export function matchTopic(topic: TopicDataEntry, url: string, title: string): boolean {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const byUrl = (topic.url_patterns || []).some(
    (p) => p && urlLower.includes(String(p).toLowerCase()),
  );
  if (byUrl) return true;
  return (topic.title_keywords || []).some(
    (k) =>
      k &&
      (titleLower.includes(String(k).toLowerCase()) ||
        urlLower.includes(String(k).toLowerCase())),
  );
}

/** First topic matching the page, in topics.json order. */
export function findTopic(
  topics: readonly TopicDataEntry[],
  url: string,
  title: string,
): TopicDataEntry | undefined {
  return topics.find((t) => matchTopic(t, url, title));
}

/** The alert (if any) attached to a topic slug. */
export function findAlert(
  alerts: readonly AlertEntry[],
  topicSlug: string,
): AlertEntry | undefined {
  return alerts.find((a) => a.topic_slug === topicSlug);
}

// ------------------------------------------------------------ toolbar badge

/** Number shown on the toolbar icon: the alerts count. */
export function alertCount(alerts: readonly AlertEntry[]): number {
  return alerts.length;
}

/** Badge text for a count: the number, or empty when zero. */
export function badgeText(count: number): string {
  return count > 0 ? String(count) : "";
}

// ------------------------------------------------------------ seeds (popup)

export interface Seed {
  id: string;
  title: string;
  url: string;
  selectedText: string;
  note: string;
  capturedAt: string;
}

export interface SeedPageInput {
  title: string;
  url: string;
  selectedText: string;
  note: string;
}

/**
 * Build one seed record. The clock and the random suffix are injected
 * so the shape is testable; the popup passes Date / Math.random.
 */
export function createSeed(input: SeedPageInput, now: Date, randomSuffix: string): Seed {
  return {
    id: `seed-${now.getTime()}-${randomSuffix}`,
    title: input.title,
    url: input.url,
    selectedText: input.selectedText,
    note: input.note,
    capturedAt: now.toISOString(),
  };
}

/**
 * Issue-format export text: the same 标题 / 链接 / 理由 fields as the
 * A4 web submission form and the GitHub Issue template.
 */
export function formatIssueText(seeds: readonly Seed[]): string {
  return seeds
    .map((s, i) => {
      const lines = [
        `## 投苗 ${seeds.length > 1 ? `${i + 1}/${seeds.length}` : ""}`.trim(),
        `标题：${s.title || "(无标题)"}`,
        `链接：${s.url}`,
      ];
      const reason = s.note || (s.selectedText ? s.selectedText.slice(0, 200) : "");
      lines.push(`理由：${reason || "(未填)"}`);
      if (s.selectedText && s.note) {
        lines.push(`摘录：${s.selectedText.slice(0, 200)}`);
      }
      lines.push(`收苗时间：${s.capturedAt}`);
      return lines.join("\n");
    })
    .join("\n\n");
}
