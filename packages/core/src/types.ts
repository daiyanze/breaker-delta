// Shared shapes for @breaker-delta/core. These mirror the plain dicts
// the Python engine passes around; index signatures keep the port as
// permissive as the original (extra keys ride along untouched).

export interface CandidateItem {
  source: string;
  name: string;
  url: string;
  metrics?: Record<string, unknown> | null;
  detail?: string;
  keyword_hits?: Record<string, string[]>;
  topic_hits?: Record<string, number>;
  novel?: boolean;
  [key: string]: unknown;
}

export interface SourceResult {
  source: string;
  layer?: number;
  status?: string;
  note?: string;
  items: CandidateItem[];
  [key: string]: unknown;
}

/** Loose config dict, as loaded from config.yaml / config.json. */
export interface RadarConfig {
  keywords?: {
    mute?: unknown[];
    boost?: unknown[];
    alert?: unknown[];
    [key: string]: unknown;
  };
  topics?: Record<string, number> | unknown;
  /** Bundled preset name (presets/<name>/config.yaml is the base layer). */
  preset?: string;
  /** Category taxonomy override; parsed by catRulesFromConfig(). */
  categories?: unknown;
  grading?: { relevance_topics?: unknown[]; [key: string]: unknown };
  filters?: { max_age_hours?: unknown; [key: string]: unknown };
  vocab?: {
    enabled?: boolean;
    window_days?: unknown;
    state_file?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface TopicReview {
  due: unknown;
  result: string | null;
  checked_on: string | null;
  _first_seen: string;
}

export interface StoreTopic {
  name: string;
  first_seen: string;
  last_seen: string;
  sources: string[];
  history: { date: string; grade: string }[];
  review?: TopicReview | Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface TopicStore {
  topics: StoreTopic[];
  [key: string]: unknown;
}

/** Per-language rendering of an item's agent-written text. The item's
 * own title/body/action stay the canonical main-language text (topic
 * identity, heat and slugs are computed from them); `i18n` only carries
 * the translations the publisher picks when building that language. */
export interface ItemI18n {
  title?: string | null;
  body?: string | null;
  action?: string | null;
}

export interface EditionItem {
  level?: string | null;
  title?: string | null;
  body?: string | null;
  action?: string | null;
  sources?: string[] | null;
  links?: string[] | null;
  is_new?: boolean | null;
  i18n?: Record<string, ItemI18n> | null;
  /** Attached by the load step (publish.load), like Python's _heat. */
  _heat: number;
  _rank: number;
  [key: string]: unknown;
}

export interface Edition {
  date: string;
  slot?: string | null;
  published_at?: string | null;
  title?: string | null;
  /** Per-language edition title (e.g. for the archive page). */
  i18n?: Record<string, { title?: string | null }> | null;
  items: EditionItem[];
  [key: string]: unknown;
}

export interface TopicApp {
  edition: number;
  date: string;
  slot: string | null;
  published: string | null;
  category: string;
  title: string;
  level: string | null;
  heat: number;
  rank: number;
  sources: string[];
  links: string[];
  body: string;
  action: string;
  i18n?: Record<string, ItemI18n> | null;
  is_new: boolean;
  heat_delta: number | null;
  rank_delta: number | null;
}

export interface Topic {
  key: string;
  name: string;
  apps: TopicApp[];
  id: string;
  slug: string;
}
