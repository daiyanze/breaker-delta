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

/** Data repo (owner/name) that receives echo submissions by default. */
export const DATA_REPO = "daiyanze/breaker-delta-data";

/**
 * Canonical topic page URL: <site>/<slug>.html — the file name the
 * publisher writes for a topic (core `topicFile`), built from the
 * precomputed slug in topics.json (which carries no url field).
 * `siteBase` comes from the user's settings and defaults to the
 * official instance.
 */
export function topicPageUrl(topic: { slug: string }, siteBase: string = SITE_BASE): string {
  return `${siteBase}${topic.slug}.html`;
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

// ------------------------------------------------------------ echoes (popup)

export interface Echo {
  id: string;
  title: string;
  url: string;
  selectedText: string;
  note: string;
  capturedAt: string;
  /** Set when the prefilled GitHub Issue page was opened for this echo. */
  issueOpenedAt?: string;
}

export interface EchoPageInput {
  title: string;
  url: string;
  selectedText: string;
  note: string;
}

/**
 * Build one echo record. The clock and the random suffix are injected
 * so the shape is testable; the popup passes Date / Math.random.
 */
export function createEcho(input: EchoPageInput, now: Date, randomSuffix: string): Echo {
  return {
    id: `echo-${now.getTime()}-${randomSuffix}`,
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
export function formatIssueText(echoes: readonly Echo[]): string {
  return echoes
    .map((s, i) => {
      const lines = [
        `## 投波 ${echoes.length > 1 ? `${i + 1}/${echoes.length}` : ""}`.trim(),
        `标题：${s.title || "(无标题)"}`,
        `链接：${s.url}`,
      ];
      const reason = s.note || (s.selectedText ? s.selectedText.slice(0, 200) : "");
      lines.push(`理由：${reason || "(未填)"}`);
      if (s.selectedText && s.note) {
        lines.push(`摘录：${s.selectedText.slice(0, 200)}`);
      }
      lines.push(`收波时间：${s.capturedAt}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

// ------------------------------------------------------------ settings

export interface Settings {
  /** GitHub repo (owner/name) whose Issues receive echo submissions. */
  dataRepo: string;
  /** Instance site base URL (topics/alerts data + topic page links). */
  siteBase: string;
  /** Open the prefilled Issue page right after capturing an echo. */
  openIssueAfterCapture: boolean;
  /** Keep the local copy after its Issue page has been opened. */
  keepLocalAfterSubmit: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  dataRepo: DATA_REPO,
  siteBase: SITE_BASE,
  openIssueAfterCapture: false,
  keepLocalAfterSubmit: true,
};

const DATA_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Accept "owner/repo", a github.com URL, or a trailing ".git"/slash;
 * anything else falls back to the default data repo.
 */
export function normalizeDataRepo(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_SETTINGS.dataRepo;
  let v = input.trim();
  v = v.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  return DATA_REPO_RE.test(v) ? v : DEFAULT_SETTINGS.dataRepo;
}

/** Accept only http(s) URLs; force a trailing slash. */
export function normalizeSiteBase(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_SETTINGS.siteBase;
  const v = input.trim();
  if (!/^https?:\/\/\S+$/i.test(v)) return DEFAULT_SETTINGS.siteBase;
  return v.endsWith("/") ? v : `${v}/`;
}

/** Stored settings record -> Settings, with per-field fallbacks. */
export function parseSettings(data: unknown): Settings {
  const raw = (data ?? {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    dataRepo: normalizeDataRepo(raw.dataRepo),
    siteBase: normalizeSiteBase(raw.siteBase),
    openIssueAfterCapture: raw.openIssueAfterCapture === true,
    keepLocalAfterSubmit: raw.keepLocalAfterSubmit !== false,
  };
}

// ------------------------------------------------------------ one-click submit (投波)

/** Echoes whose Issue page has not been opened yet. */
export function pendingEchoes(echoes: readonly Echo[]): Echo[] {
  return echoes.filter((e) => !e.issueOpenedAt);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Issue body for a single echo: the same 标题 / 链接 / 理由 / 摘录
 * fields as the Issue template, with the excerpt capped so the
 * prefilled URL stays well under GitHub's length limit (414s).
 */
export function formatIssueBody(echo: Echo, excerptMax = 1200): string {
  const lines = [
    `标题：${echo.title || "(无标题)"}`,
    `链接：${echo.url}`,
  ];
  const reason = echo.note || (echo.selectedText ? truncate(echo.selectedText, excerptMax) : "");
  lines.push(`理由：${reason || "(未填)"}`);
  if (echo.selectedText && echo.note) {
    lines.push(`摘录：${truncate(echo.selectedText, excerptMax)}`);
  }
  lines.push(`收波时间：${echo.capturedAt}`);
  return lines.join("\n");
}

/**
 * Prefilled "new issue" URL (GitHub's documented query parameters):
 * the echo.md template supplies the echo label and title prefix, and
 * title/body arrive already filled in — the user only clicks Submit.
 * No token and no extra extension permission is involved.
 */
export function buildIssueUrl(echo: Echo, dataRepo: string): string {
  const repo = normalizeDataRepo(dataRepo);
  const title = `🌀 投波：${truncate(echo.title || "无标题", 80)}`;
  let excerptMax = 1200;
  let url = "";
  for (;;) {
    const body = formatIssueBody(echo, excerptMax);
    url =
      `https://github.com/${repo}/issues/new` +
      `?template=echo.md&title=${encodeURIComponent(title)}` +
      `&body=${encodeURIComponent(body)}`;
    if (url.length <= 7500 || excerptMax === 0) return url;
    excerptMax = Math.floor(excerptMax / 2);
  }
}
