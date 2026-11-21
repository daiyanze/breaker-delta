/**
 * Fixture-backed query layer (issue #162). Same signatures as the database
 * query layer (#57), so a page can be built and previewed before any pipeline
 * code exists. Every value is validated against its read contract on read.
 */
import {
  ChangesSchema,
  CorrectionTopicsSchema,
  DeskCorrectionsSchema,
  DeskMailSchema,
  type DeskQueries,
  DeskSettingsSchema,
  EchoesSchema,
  EditionListSchema,
  EditionSchema,
  type ReadQueries,
  ScanLogSchema,
  SearchResultSchema,
  ShareCardDataSchema,
  type ShareCardKey,
  SiteMetaSchema,
  SourceDetailSchema,
  SourceListSchema,
  TopicLookupSchema,
  TrackRecordSchema,
  VerdictQueueSchema,
} from "@bd/contracts";
import { FIXTURE_SET_NAMES, type FixtureSetName, RAW_SETS } from "./sets.ts";

export type { FixtureSetName };
export { FIXTURE_SET_NAMES, RAW_SETS };

/** The set used when none is named: a busy day in three languages. */
export const DEFAULT_FIXTURE_SET: FixtureSetName = "busy";

export function isFixtureSetName(name: string): name is FixtureSetName {
  return (FIXTURE_SET_NAMES as string[]).includes(name);
}

/** Key of a share card in `share-cards.json`. */
export function shareCardKey(key: ShareCardKey): string {
  return key.kind === "topic" ? `topic:${key.slug}:${key.lang}` : `site:${key.card}:${key.lang}`;
}

function entry<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

export function createFixtureReadQueries(name: FixtureSetName = DEFAULT_FIXTURE_SET): ReadQueries {
  const set = RAW_SETS[name];
  const editions: Record<string, unknown> = set.editions;
  const editionLists: Record<string, unknown> = set.editionLists;
  const topics: Record<string, unknown> = set.topics;
  const details: Record<string, unknown> = set.sourceDetails;
  const searches: Record<string, unknown> = set.search;
  const cards: Record<string, unknown> = set.shareCards;

  return {
    async siteMeta() {
      return SiteMetaSchema.parse(set.siteMeta);
    },
    async edition(opts) {
      const slot = opts?.slot ?? set.siteMeta.lastSlot;
      const raw = slot === null ? undefined : entry(editions, slot);
      return raw === undefined ? null : EditionSchema.parse(raw);
    },
    async editionList(opts) {
      const day = opts?.day ?? Object.keys(editionLists).sort().at(-1);
      const raw = day === undefined ? undefined : entry(editionLists, day);
      return raw === undefined ? null : EditionListSchema.parse(raw);
    },
    async changes(opts) {
      const all = ChangesSchema.parse(set.changes);
      const before = opts?.before;
      const types = opts?.types;
      if (before === undefined && types === undefined) return all;
      const runs = all.runs
        .filter((run) => before === undefined || run.slot < before)
        .map((run) => ({
          ...run,
          changes: run.changes.filter((c) => types === undefined || types.includes(c.type)),
        }))
        .filter((run) => run.changes.length > 0);
      return { runs, nextBefore: before === undefined ? all.nextBefore : null };
    },
    async topic(slug) {
      const raw = entry(topics, slug);
      return raw === undefined ? null : TopicLookupSchema.parse(raw);
    },
    async echoes(opts) {
      const all = EchoesSchema.parse(set.echoes);
      const limit = opts?.limit;
      if (limit === undefined) return all;
      return {
        ...all,
        single: { ...all.single, items: all.single.items.slice(0, limit) },
        inWave: { ...all.inWave, items: all.inWave.items.slice(0, limit) },
      };
    },
    async trackRecord() {
      return TrackRecordSchema.parse(set.trackRecord);
    },
    async sources() {
      return SourceListSchema.parse(set.sources);
    },
    async source(groupId) {
      const raw = entry(details, groupId);
      return raw === undefined ? null : SourceDetailSchema.parse(raw);
    },
    async search(query) {
      const key = query.trim().toLowerCase();
      const raw = entry(searches, key);
      if (raw !== undefined) return SearchResultSchema.parse(raw);
      return {
        query,
        counts: { waves: 0, echoes: 0, sources: 0 },
        waves: [],
        echoes: [],
        sources: [],
      };
    },
    async shareCard(key) {
      const raw = entry(cards, shareCardKey(key));
      return raw === undefined ? null : ShareCardDataSchema.parse(raw);
    },
  };
}

export function createFixtureDeskQueries(name: FixtureSetName = DEFAULT_FIXTURE_SET): DeskQueries {
  const set = RAW_SETS[name];
  return {
    async settings() {
      return DeskSettingsSchema.parse(set.deskSettings);
    },
    async verdictQueue() {
      return VerdictQueueSchema.parse(set.deskVerdictQueue);
    },
    async correctionTopics() {
      return CorrectionTopicsSchema.parse(set.deskCorrectionTopics);
    },
    async corrections() {
      return DeskCorrectionsSchema.parse(set.deskCorrections);
    },
    async scanLog() {
      return ScanLogSchema.parse(set.deskScanLog);
    },
    async mail() {
      return DeskMailSchema.parse(set.deskMail);
    },
  };
}
