// Cross-boundary schemas (Rewrite Phase 0, design doc §4): every
// structure that crosses a process/file/network boundary gets one
// descriptor here — edition files, the topic store, config, plugin
// manifests, install records, plugin page files, the extension data
// payloads and the push record entries. Types are derived with
// Infer<>; the hand-written interfaces in types.ts/data.ts remain
// the internal shapes, and the contract tests keep the two in sync
// by validating real payloads both ways.

import {
  arr, bool, enm, lit, nullable, num, obj, opt, rec, str, union, unk,
  type Infer,
} from "./schema.js";

/** Plugin/panel localized text: a plain string or a per-language map. */
export const localizedTextSchema = union(
  str(),
  obj({ zh: opt(str()), en: opt(str()), ja: opt(str()) }),
);

// ---- Editions ---------------------------------------------------------------

const itemI18nSchema = rec(obj({
  title: opt(nullable(str())),
  body: opt(nullable(str())),
  action: opt(nullable(str())),
}));

/** An edition item as written in an edition file (no load-time fields). */
export const editionItemWireSchema = obj({
  level: opt(nullable(str())),
  title: opt(nullable(str())),
  body: opt(nullable(str())),
  action: opt(nullable(str())),
  sources: opt(nullable(arr(str()))),
  links: opt(nullable(arr(str()))),
  is_new: opt(nullable(bool())),
  i18n: opt(nullable(itemI18nSchema)),
  plugins: opt(rec(rec(unk()))),
});

/** An edition item after the load step attached _heat/_rank. */
export const editionItemSchema = obj({
  level: opt(nullable(str())),
  title: opt(nullable(str())),
  body: opt(nullable(str())),
  action: opt(nullable(str())),
  sources: opt(nullable(arr(str()))),
  links: opt(nullable(arr(str()))),
  is_new: opt(nullable(bool())),
  i18n: opt(nullable(itemI18nSchema)),
  plugins: opt(rec(rec(unk()))),
  _heat: num(),
  _rank: num(),
});

/** An edition file (wire form; also what the push API accepts). */
export const editionSchema = obj({
  schema: opt(num()),
  date: str(),
  slot: opt(nullable(str())),
  published_at: opt(nullable(str())),
  title: opt(nullable(str())),
  i18n: opt(nullable(rec(obj({ title: opt(nullable(str())) })))),
  items: arr(editionItemWireSchema),
  updates: opt(arr(unk())),
  missing: opt(arr(str())),
  pending_checks: opt(arr(unk())),
});

// The wire form of an edition: the Edition interface without the
// load-time _heat/_rank attachments. (Infer<> over the full edition
// descriptor exceeds TS instantiation depth; the contract tests keep
// this hand-written alias honest by validating real payloads.)
import type { Edition, EditionItem } from "./types.js";
export type EditionWireItem = Omit<EditionItem, "_heat" | "_rank">;
export type EditionWire = Omit<Edition, "items"> & { items: EditionWireItem[] };

// ---- Topic store (state/seen-topics.json) -----------------------------------

export const topicStoreSchema = obj({
  topics: arr(obj({
    name: str(),
    first_seen: str(),
    last_seen: str(),
    sources: arr(str()),
    history: arr(obj({ date: str(), grade: str() })),
    review: opt(nullable(obj({
      due: opt(nullable(str())),
      result: opt(nullable(str())),
      checked_on: opt(nullable(str())),
      _first_seen: opt(str()),
    }))),
  })),
});

export type TopicStoreShape = Infer<typeof topicStoreSchema>;

// ---- Config -------------------------------------------------------------------

/** The config sections the code actually reads; everything else rides
 * along unchecked (open object), exactly like RadarConfig today. */
export const radarConfigSchema = obj({
  preset: opt(str()),
  keywords: opt(obj({
    mute: opt(arr(unk())),
    boost: opt(arr(unk())),
    alert: opt(arr(unk())),
  })),
  plugins: opt(rec(obj({ enabled: opt(bool()) }))),
  grading: opt(obj({
    model: opt(str()),
    base_url: opt(str()),
    api_key_env: opt(str()),
    auto: opt(bool()),
  })),
  categories: opt(unk()),
  topics: opt(unk()),
  filters: opt(unk()),
  vocab: opt(unk()),
  sources: opt(rec(rec(unk()))),
});

// ---- Plugin manifests -----------------------------------------------------------

/** Slot vocabulary as written in manifests: the declarative slots
 * ("panel" rendering, "grading" prompt injection) plus the seven
 * code-plugin slots. */
export const PLUGIN_SLOTS = [
  "panel", "grading", "fetcher", "exit", "score", "entities", "review", "page", "tools",
] as const;

export const pluginManifestSchema = obj({
  id: str(),
  api: opt(num()),
  order: opt(num()),
  name: opt(localizedTextSchema),
  description: opt(localizedTextSchema),
  slots: opt(arr(enm(...PLUGIN_SLOTS))),
  entry: opt(str()),
  layer: opt(num()),
  permissions: opt(obj({
    network: opt(union(arr(str()), str())),
    secrets: opt(arr(str())),
    write: opt(bool()),
  })),
  score: opt(obj({
    label: opt(localizedTextSchema),
    min: opt(num()),
    max: opt(num()),
  })),
  page: opt(obj({
    slug: opt(str()),
    title: opt(localizedTextSchema),
  })),
});

export type PluginManifestShape = Infer<typeof pluginManifestSchema>;

// ---- Plugin page files (state/plugin-pages/<id>.json) ---------------------------

const panelBlockSchema = union(
  obj({ type: lit("subh"), text: localizedTextSchema }),
  obj({ type: lit("note"), text: localizedTextSchema, margin: opt(num()) }),
  obj({
    type: lit("olist"),
    items: arr(obj({
      label: localizedTextSchema,
      format: localizedTextSchema,
      when: opt(str()),
    })),
  }),
  obj({ type: lit("tips"), lists: rec(arr(str())) }),
  obj({
    type: lit("fields"),
    items: arr(obj({ label: localizedTextSchema, field: str() })),
  }),
  obj({ type: lit("disclaimer"), text: localizedTextSchema }),
);

export const pluginPageFileSchema = obj({
  id: str(),
  slug: str(),
  title: localizedTextSchema,
  langs: rec(obj({ blocks: arr(panelBlockSchema) })),
});

export type PluginPageFileShape = Infer<typeof pluginPageFileSchema>;

// ---- Install records (state/installs.json) ---------------------------------------

const installRecordSchema = obj({
  source: str(),
  installed_at: str(),
  files: rec(str()),
});

export const installsFileSchema = obj({
  plugins: opt(rec(installRecordSchema)),
  presets: opt(rec(installRecordSchema)),
});

export type InstallsFileShape = Infer<typeof installsFileSchema>;

// ---- Extension data payloads (data/topics.json, data/alerts.json) ------------------

export const topicsDataSchema = obj({
  generated_at: nullable(str()),
  topics: arr(obj({
    slug: str(),
    title: str(),
    heat: num(),
    first_seen: str(),
    level: nullable(str()),
    url_patterns: arr(str()),
    title_keywords: arr(str()),
    plugins: opt(rec(rec(unk()))),
  })),
});

export const alertsDataSchema = obj({
  generated_at: str(),
  alerts: arr(obj({
    topic_slug: str(),
    title: str(),
    reason: enm("resonance", "surge"),
    heat_before: num(),
    heat_after: num(),
    edition: str(),
    triggered_at: str(),
    dedupe_key: str(),
  })),
});

// ---- Push record entries (POST /api/record, `record` command) ----------------------

export const recordEntriesSchema = arr(obj({
  name: str(1),
  sources: arr(str()),
  grade: str(1),
}));
