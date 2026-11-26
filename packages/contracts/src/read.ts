/**
 * Read contracts: the shapes the public site reads (issue #162).
 * These are not the tables (that is #17); they are what a page receives.
 * The fixture query layer (`@bd/fixtures`), the database query layer (#57)
 * and `/api/v1` (#68) all return exactly these shapes.
 *
 * Rules that hold in every read model:
 * - Sources are cited by echo id. The only URLs are echo URLs, mapped by code
 *   from stored echoes; no model-written URL or source name appears (ADR 0003).
 * - Wave state, height and rank are computed by code, never by a model.
 * - Every text field carries the language it is in.
 */
import { z } from "zod";
import { type ChangeType, ChangeTypeSchema, LanguageSchema } from "./shared.ts";

// ---------------------------------------------------------------- primitives

/** An instant with its UTC offset, e.g. "2026-11-19T14:00:00+09:00". */
export const InstantSchema = z.iso.datetime({ offset: true });
/** A calendar day in the site's time zone, e.g. "2026-11-19". */
export const DaySchema = z.iso.date();
/** A run slot id as produced by `slotId` in `@bd/core`, e.g. "20261119T0500" (UTC). */
export const SlotSchema = z.string().regex(/^\d{8}T\d{4}$/);
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const IdSchema = z.string().min(1);
/** A height computed by `@bd/core`. */
export const HeightSchema = z.number().nonnegative();
/** Percent change over 24 hours; null when the wave did not exist 24 hours ago. */
export const Change24hSchema = z.number().nullable();

/** Text in one of the site's languages, written by the site or its summary model. */
export const LocalizedTextSchema = z.object({
  lang: LanguageSchema,
  text: z.string().min(1),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/** Text exactly as a source published it, in its own language (BCP 47, "und" if unknown). */
export const OriginalTextSchema = z.object({
  lang: z.string().min(2).max(35),
  text: z.string().min(1),
});
export type OriginalText = z.infer<typeof OriginalTextSchema>;

export const WaveStateSchema = z.enum(["up", "flat"]);
export const SeaStateSchema = z.enum(["flat", "calm", "moderate", "choppy"]);
export const OutcomeSchema = z.enum(["hit", "partial", "miss", "undetermined"]);

/**
 * How a topic is named on a page. `headlines` are model-written, one per
 * language, and may be empty (no summary, or the site writes none).
 * `sourceHeadline` is the first source's own headline and is always present.
 */
const TopicNameFields = {
  slug: SlugSchema,
  headlines: z.array(LocalizedTextSchema),
  shortTitles: z.array(LocalizedTextSchema),
  sourceHeadline: OriginalTextSchema,
};

/** A topic as a one-line reference on another page. */
export const TopicRefSchema = z.object({
  ...TopicNameFields,
  state: WaveStateSchema,
  height: HeightSchema,
  change24h: Change24hSchema,
});
export type TopicRef = z.infer<typeof TopicRefSchema>;

/** The wave an echo belongs to, as shown next to the echo. */
export const EchoWaveSchema = z.object({
  slug: SlugSchema,
  shortTitles: z.array(LocalizedTextSchema),
  height: HeightSchema,
});

/** One echo, cited by id. The URL is the echo's own, mapped by code. */
export const EchoItemSchema = z.object({
  id: IdSchema,
  groupId: IdSchema,
  groupName: z.string().min(1),
  url: z.url(),
  title: OriginalTextSchema,
  firstSeenAt: InstantSchema,
  /** The topic the echo belongs to when that topic is a wave; null otherwise. */
  wave: EchoWaveSchema.nullable(),
});
export type EchoItem = z.infer<typeof EchoItemSchema>;

// ----------------------------------------------------------------- site meta

export const SiteMetaSchema = z.object({
  siteName: z.string().min(1),
  languages: z.array(LanguageSchema).min(1),
  defaultLanguage: LanguageSchema,
  /** IANA time zone used for labels, days and mail send time. */
  timeZone: z.string().min(1),
  /** Null before the first scan. */
  lastRunAt: InstantSchema.nullable(),
  lastSlot: SlotSchema.nullable(),
  nextRunAt: InstantSchema,
  runIntervalMinutes: z.number().int().min(15),
  /** False when no summary writer is set up: pages show sources' own headlines only. */
  summariesEnabled: z.boolean(),
  mail: z.object({ enabled: z.boolean() }),
  analytics: z.object({
    googleAnalytics: z.boolean(),
    umami: z.boolean(),
    plausible: z.boolean(),
  }),
});
export type SiteMeta = z.infer<typeof SiteMetaSchema>;

// ------------------------------------------------------------------- edition

export const RankRowSchema = z.object({
  ...TopicNameFields,
  rank: z.number().int().positive(),
  height: HeightSchema,
  change24h: Change24hSchema,
  sourceCount: z.number().int().positive(),
  echoCount: z.number().int().positive(),
  state: WaveStateSchema,
  formedAt: InstantSchema,
  /** Heights at the last few runs, oldest first, ending at this run. */
  trend: z.array(HeightSchema).min(1),
});
export type RankRow = z.infer<typeof RankRowSchema>;

export const DueStubSchema = z.object({
  predictionId: IdSchema,
  ...TopicNameFields,
  criterion: LocalizedTextSchema,
  registeredAt: InstantSchema,
  dueAt: InstantSchema,
});

export const VerdictStubSchema = z.object({
  predictionId: IdSchema,
  ...TopicNameFields,
  criterion: LocalizedTextSchema,
  outcome: OutcomeSchema,
  confirmedAt: InstantSchema,
  revised: z.boolean(),
});

export const TideEntrySchema = z.object({
  slug: SlugSchema,
  formedAt: InstantSchema,
  height: HeightSchema,
});

/**
 * One run as the UI shows it: an "edition" is a display name for a run's time
 * slot (ADR 0015). Nothing here assumes a 60-minute interval.
 */
export const EditionSchema = z.object({
  slot: SlotSchema,
  startsAt: InstantSchema,
  /** The slot's local time in the site's time zone, e.g. "14:00". */
  label: z.string().regex(/^\d{2}:\d{2}$/),
  seaState: SeaStateSchema,
  waveCount: z.number().int().nonnegative(),
  formedToday: z.number().int().nonnegative(),
  /** Every wave that is up, tallest first. */
  ranking: z.array(RankRowSchema),
  /** Waves formed today, by the time they formed. Each slug is in `ranking`. */
  tideTable: z.array(TideEntrySchema),
  ebb: z.object({
    /** Waves still up but falling. */
    notices: z.array(
      z.object({
        ...TopicNameFields,
        formedAt: InstantSchema,
        peak: z.object({ height: HeightSchema, at: InstantSchema }),
        echoCount: z.number().int().positive(),
        height: HeightSchema,
        change24h: Change24hSchema,
      }),
    ),
    /** Waves that went flat in the last 24 hours. */
    wentFlat24h: z.number().int().nonnegative(),
  }),
  verdicts: z.object({
    due: z.array(DueStubSchema),
    recent: z.array(VerdictStubSchema),
  }),
  /** Echoes with one source so far. */
  classifieds: z.object({
    total: z.number().int().nonnegative(),
    items: z.array(EchoItemSchema),
  }),
});
export type Edition = z.infer<typeof EditionSchema>;

// -------------------------------------------------------------- edition list

export const EditionSlotSchema = z.object({
  slot: SlotSchema,
  startsAt: InstantSchema,
  label: z.string().regex(/^\d{2}:\d{2}$/),
  /** printed: the run finished; missed: no run for this slot; upcoming: not yet. */
  status: z.enum(["printed", "missed", "upcoming"]),
  waveCount: z.number().int().nonnegative(),
  /** Up to three tallest waves of that run; `formedToday` colours the bar. */
  top: z.array(z.object({ height: HeightSchema, formedToday: z.boolean() })).max(3),
});

export const EditionListSchema = z.object({
  day: DaySchema,
  /** The last 7 days, newest first, and whether any edition exists on each. */
  days: z.array(z.object({ day: DaySchema, exists: z.boolean() })).length(7),
  /** Every slot of the day in order, including empty ones. */
  slots: z.array(EditionSlotSchema),
});
export type EditionList = z.infer<typeof EditionListSchema>;

// ------------------------------------------------------------------- changes

export const ChangeSchema = z.object({
  id: IdSchema,
  type: ChangeTypeSchema,
  at: InstantSchema,
  topic: TopicRefSchema,
  /** One line of detail, written by code or by the desk. */
  detail: z.array(LocalizedTextSchema).min(1),
});
export type Change = z.infer<typeof ChangeSchema>;

export const ChangesSchema = z.object({
  /** Newest run first. */
  runs: z.array(
    z.object({
      slot: SlotSchema,
      startsAt: InstantSchema,
      label: z.string().regex(/^\d{2}:\d{2}$/),
      changes: z.array(ChangeSchema).min(1),
    }),
  ),
  /** Pass as `before` to read older runs; null when there are none. */
  nextBefore: SlotSchema.nullable(),
});
export type Changes = z.infer<typeof ChangesSchema>;

// --------------------------------------------------------------------- topic

export const SummaryTextSchema = z.object({
  lang: LanguageSchema,
  title: z.string().min(1),
  body: z.string().min(1),
});

export const SummaryLabelSchema = z.enum(["unverified", "source_text_not_read"]);

/**
 * The site's own words for the "unverified" label (ADR 0006, #47), one entry
 * per language. Code shows them next to the summary; they never go into the
 * model's text, and the model never writes them. In `note`, `{min}` stands
 * for the `factGateFirstHandSources` setting (`unverifiedWording` in
 * `@bd/core` fills it in). The text is design board 51's. Its second
 * sentence ("says only what was reported and by whom") does not hold yet:
 * the summarize prompt asks for neutral summaries but not ADR 0006's
 * reported-only form, and it forbids naming who reported. Nothing may show
 * this note until the prompt asks for both.
 */
export const UNVERIFIED_WORDING = {
  en: {
    label: "Unverified",
    note: "We could not confirm this with {min} first-hand sources. The wording below says only what was reported and by whom.",
  },
  zh: {
    label: "未经证实",
    note: "尚未经 {min} 个第一手来源证实。以下文字仅说明报道了什么、由谁报道。",
  },
  ja: {
    label: "未確認",
    note: "{min} つの一次情報源による確認が取れていません。以下は、何が報じられ、誰が報じたかのみを記しています。",
  },
} as const satisfies Record<z.infer<typeof LanguageSchema>, { label: string; note: string }>;

/**
 * The five summary states are: published, published with the "unverified"
 * label, published with the "source text not read" label (both labels may
 * show together), withdrawn, and none.
 */
export const SummarySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("published"),
    version: z.number().int().positive(),
    publishedAt: InstantSchema,
    labels: z.array(SummaryLabelSchema),
    texts: z.array(SummaryTextSchema).min(1),
    /** Echo ids the summary rests on; every one is in the topic's clippings. */
    evidenceEchoIds: z.array(IdSchema).min(1),
    /** The provider name from settings that wrote this version. */
    writer: z.string().min(1),
    /** Why this version was written. */
    reason: z.array(LocalizedTextSchema).min(1),
  }),
  z.object({
    status: z.literal("withdrawn"),
    withdrawnAt: InstantSchema,
    reason: z.array(LocalizedTextSchema).min(1),
  }),
  z.object({
    status: z.literal("none"),
    /**
     * pending: the next run writes it; no_writer: the site writes no summaries;
     * failed_checks: the last version was discarded.
     */
    reason: z.enum(["pending", "no_writer", "failed_checks"]),
    expectedAt: InstantSchema.nullable(),
  }),
]);
export type Summary = z.infer<typeof SummarySchema>;

export const VerdictSchema = z.object({
  id: IdSchema,
  outcome: OutcomeSchema,
  /** proposed: the model proposed it and a person has not confirmed it yet. */
  status: z.enum(["proposed", "confirmed"]),
  decidedAt: InstantSchema,
  reason: z.array(LocalizedTextSchema).min(1),
  /** The verdict this one revises (ADR 0013); null for the first. */
  revises: IdSchema.nullable(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const PredictionSchema = z.object({
  id: IdSchema,
  /** The locked test, in the language it was written in. */
  criterion: LocalizedTextSchema,
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  registeredAt: InstantSchema,
  dueAt: InstantSchema,
  /** Oldest first. The last confirmed one is current; earlier ones are shown struck through. */
  verdicts: z.array(VerdictSchema),
});
export type Prediction = z.infer<typeof PredictionSchema>;

export const HistoryPointSchema = z.object({
  slot: SlotSchema,
  at: InstantSchema,
  height: HeightSchema,
});

export const TopicPageSchema = z.object({
  id: IdSchema,
  ...TopicNameFields,
  state: WaveStateSchema,
  height: HeightSchema,
  change24h: Change24hSchema,
  /** Null when the topic is flat. */
  rank: z.number().int().positive().nullable(),
  sourceCount: z.number().int().positive(),
  echoCount: z.number().int().positive(),
  formedAt: InstantSchema,
  peak: z.object({ height: HeightSchema, at: InstantSchema }),
  wentFlatAt: InstantSchema.nullable(),
  history: z.object({
    /** One point per run, oldest first. */
    points: z.array(HistoryPointSchema).min(1),
    annotations: z.array(
      z.object({
        at: InstantSchema,
        kind: z.enum([
          "formed",
          "summary",
          "correction",
          "withdrawn",
          "merged",
          "went_flat",
          "peak",
        ]),
      }),
    ),
  }),
  summary: SummarySchema,
  /** Earlier published versions, newest first. */
  earlierVersions: z.array(
    z.object({
      version: z.number().int().positive(),
      publishedAt: InstantSchema,
      reason: z.array(LocalizedTextSchema).min(1),
      corrections: z.number().int().nonnegative(),
    }),
  ),
  corrections: z.array(
    z.object({
      id: IdSchema,
      version: z.number().int().positive(),
      at: InstantSchema,
      texts: z.array(LocalizedTextSchema).min(1),
    }),
  ),
  /** Every echo of the topic, oldest first. */
  clippings: z.array(
    EchoItemSchema.extend({
      /** origin: the group where the story started; pickup: a later one. */
      role: z.enum(["origin", "pickup"]),
      /** Set when the echo came in through a merge. */
      mergedFrom: SlugSchema.nullable(),
    }),
  ),
  /** Null only when the site writes no summaries. */
  prediction: PredictionSchema.nullable(),
  related: z.array(TopicRefSchema),
  mergedFrom: z.array(
    z.object({
      slug: SlugSchema,
      sourceHeadline: OriginalTextSchema,
      shortTitles: z.array(LocalizedTextSchema),
      mergedAt: InstantSchema,
      echoCount: z.number().int().positive(),
    }),
  ),
});
export type TopicPage = z.infer<typeof TopicPageSchema>;

/** A slug either names a topic or forwards permanently to the topic it was merged into. */
export const TopicLookupSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("topic"), topic: TopicPageSchema }),
  z.object({ kind: z.literal("redirect"), to: SlugSchema }),
]);
export type TopicLookup = z.infer<typeof TopicLookupSchema>;

// -------------------------------------------------------------------- echoes

export const EchoesSchema = z.object({
  day: DaySchema,
  total: z.number().int().nonnegative(),
  /** Echoes not in a wave, newest first. */
  single: z.object({ total: z.number().int().nonnegative(), items: z.array(EchoItemSchema) }),
  /** Echoes already in a wave, newest first; `wave` is set on each. */
  inWave: z.object({ total: z.number().int().nonnegative(), items: z.array(EchoItemSchema) }),
});
export type Echoes = z.infer<typeof EchoesSchema>;

// -------------------------------------------------------------- track record

export const LedgerRowSchema = z.object({
  ...TopicNameFields,
  prediction: PredictionSchema,
  formedAt: InstantSchema,
});

export const TrackRecordSchema = z.object({
  score: z.object({
    /** Hits plus half the partials over confirmed decided verdicts; null with none. */
    rate: z.number().min(0).max(1).nullable(),
    confirmed: z.number().int().nonnegative(),
    hit: z.number().int().nonnegative(),
    partial: z.number().int().nonnegative(),
    miss: z.number().int().nonnegative(),
    undetermined: z.number().int().nonnegative(),
  }),
  registered: z.number().int().nonnegative(),
  /** One mark per registered prediction, oldest first. */
  marks: z.array(
    z.object({
      predictionId: IdSchema,
      slug: SlugSchema,
      mark: z.enum(["hit", "partial", "miss", "undetermined", "under_review", "waiting"]),
      revised: z.boolean(),
    }),
  ),
  ledger: z.array(LedgerRowSchema),
  /** Verdicts left unconfirmed past their due date plus the grace period. */
  overdue: z.array(LedgerRowSchema),
  byWriter: z.array(
    z.object({
      writer: z.string().min(1),
      summaries: z.number().int().nonnegative(),
      rate: z.number().min(0).max(1).nullable(),
    }),
  ),
  /** The first due date when there is no confirmed verdict yet; null otherwise. */
  firstDueAt: InstantSchema.nullable(),
});
export type TrackRecord = z.infer<typeof TrackRecordSchema>;

// ------------------------------------------------------------------- sources

export const SourceGroupSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.array(LocalizedTextSchema).min(1),
  /** first_hand: where stories start; relaying: where they spread. */
  role: z.enum(["first_hand", "relaying"]),
  category: z.enum([
    "lab_blog",
    "code_host",
    "forum",
    "model_hub",
    "papers",
    "launches",
    "government",
    "key_accounts",
    "press",
    "search",
    "reference",
    "charts",
  ]),
  members: z.number().int().positive(),
  echoesToday: z.number().int().nonnegative(),
  echoes14d: z.number().int().nonnegative(),
  status: z.object({
    /** not_scanned: set up but not scanned yet (fresh install). */
    state: z.enum(["reporting", "late", "failing", "off", "not_scanned"]),
    since: InstantSchema,
    lastScanAt: InstantSchema.nullable(),
  }),
});
export type SourceGroup = z.infer<typeof SourceGroupSchema>;

export const SourceListSchema = z.object({
  lastSlot: SlotSchema.nullable(),
  reporting: z.number().int().nonnegative(),
  groups: z.array(SourceGroupSchema),
});
export type SourceList = z.infer<typeof SourceListSchema>;

export const SourceDetailSchema = z.object({
  group: SourceGroupSchema,
  memberNames: z.array(z.string().min(1)),
  /** The last scans, oldest first. */
  scans: z.array(z.object({ slot: SlotSchema, result: z.enum(["reported", "late", "missed"]) })),
  /** Today's echoes from this group, newest first. */
  recentEchoes: z.array(EchoItemSchema),
  /** Waves this group took part in this week, with its position among their sources (1 = first). */
  waves: z.array(
    TopicRefSchema.extend({
      position: z.number().int().positive(),
      joinedAt: InstantSchema,
    }),
  ),
});
export type SourceDetail = z.infer<typeof SourceDetailSchema>;

// -------------------------------------------------------------------- search

/** A matched range in one text field: [start, end) in UTF-16 code units. */
export const MatchSchema = z.object({
  field: z.enum(["headline", "summary", "title", "name", "description"]),
  lang: z.string().min(2).max(35),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});

export const SearchResultSchema = z.object({
  query: z.string(),
  counts: z.object({
    waves: z.number().int().nonnegative(),
    echoes: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
  }),
  /** Up waves first, tallest on top; flat ones follow. */
  waves: z.array(
    TopicRefSchema.extend({
      formedAt: InstantSchema,
      peakHeight: HeightSchema,
      wentFlatAt: InstantSchema.nullable(),
      dueAt: InstantSchema.nullable(),
      sourceCount: z.number().int().positive(),
      echoCount: z.number().int().positive(),
      matches: z.array(MatchSchema).min(1),
    }),
  ),
  /** The last 14 days, newest first. */
  echoes: z.array(EchoItemSchema.extend({ matches: z.array(MatchSchema).min(1) })),
  sources: z.array(SourceGroupSchema.extend({ matches: z.array(MatchSchema).min(1) })),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

// ---------------------------------------------------------------- share card

export const ShareCardKeySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("topic"), slug: SlugSchema, lang: LanguageSchema }),
  z.object({
    kind: z.literal("site"),
    card: z.enum(["front", "track_record", "about"]),
    lang: LanguageSchema,
  }),
]);
export type ShareCardKey = z.infer<typeof ShareCardKeySchema>;

const CardEditionSchema = z.object({ slot: SlotSchema, label: z.string(), day: DaySchema });
const CardTextSchema = z.union([LocalizedTextSchema, OriginalTextSchema]);
const CardHeadlineSchema = z.object({ headline: CardTextSchema, height: HeightSchema });

/** What a card needs. The same data draws the landscape and the tall card (ADR 0009). */
export const ShareCardDataSchema = z.discriminatedUnion("card", [
  z.object({
    card: z.literal("topic"),
    lang: LanguageSchema,
    edition: CardEditionSchema,
    slug: SlugSchema,
    rank: z.number().int().positive().nullable(),
    state: WaveStateSchema,
    /** The model headline in `lang`, or the source's own headline. Never a summary body. */
    headline: CardTextSchema,
    height: HeightSchema,
    sourceCount: z.number().int().positive(),
    echoCount: z.number().int().positive(),
  }),
  z.object({
    card: z.literal("front"),
    lang: LanguageSchema,
    edition: CardEditionSchema.nullable(),
    waveCount: z.number().int().nonnegative(),
    formedToday: z.number().int().nonnegative(),
    top: z.array(CardHeadlineSchema).max(3),
  }),
  z.object({
    card: z.literal("track_record"),
    lang: LanguageSchema,
    score: TrackRecordSchema.shape.score,
    marks: z.array(z.enum(["hit", "partial", "miss"])),
    /** Set while there is no verdict, so the card never reads "0 of 0". */
    firstDueAt: InstantSchema.nullable(),
  }),
  z.object({ card: z.literal("about"), lang: LanguageSchema }),
]);
export type ShareCardData = z.infer<typeof ShareCardDataSchema>;

// ------------------------------------------------------------- query layer

/**
 * The public query layer. `@bd/fixtures` implements it from JSON; #57
 * implements it against the database. A null result means "not found".
 */
export interface ReadQueries {
  siteMeta(): Promise<SiteMeta>;
  /** The latest edition when `slot` is omitted; null before the first run. */
  edition(opts?: { slot?: string }): Promise<Edition | null>;
  /** The latest day when `day` is omitted; null for a day with no list. */
  editionList(opts?: { day?: string }): Promise<EditionList | null>;
  changes(opts?: { before?: string; types?: readonly ChangeType[] }): Promise<Changes>;
  topic(slug: string): Promise<TopicLookup | null>;
  /** `limit` caps each of the two lists; totals are unaffected. */
  echoes(opts?: { limit?: number }): Promise<Echoes>;
  trackRecord(): Promise<TrackRecord>;
  sources(): Promise<SourceList>;
  source(groupId: string): Promise<SourceDetail | null>;
  search(query: string): Promise<SearchResult>;
  shareCard(key: ShareCardKey): Promise<ShareCardData | null>;
}
