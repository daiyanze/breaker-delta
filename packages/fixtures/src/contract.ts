/**
 * The contract checks. The same list runs against the fixture query layer
 * now, and against the database query layer (#57) and `/api/v1` (#68) later:
 * each implementation passes when every check's result parses.
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
  ShareCardKeySchema,
  SiteMetaSchema,
  SourceDetailSchema,
  SourceListSchema,
  TopicLookupSchema,
  TrackRecordSchema,
  VerdictQueueSchema,
} from "@bd/contracts";
import { type FixtureSetName, RAW_SETS } from "./sets.ts";

/**
 * The sea state of a run, by the design's rule (`design/system/README.md`,
 * "数据驱动的规则"; #109): four or more waves formed today is choppy, two or
 * three moderate, otherwise calm. "flat" is what a page shows before any
 * run, never a run's own state.
 */
export function seaStateFor(formedToday: number): "calm" | "moderate" | "choppy" {
  if (formedToday >= 4) return "choppy";
  if (formedToday >= 2) return "moderate";
  return "calm";
}

/** An edition whose sea state follows `seaStateFor`, or no edition. */
const EditionWithSea = EditionSchema.refine((e) => e.seaState === seaStateFor(e.formedToday), {
  message: "seaState does not follow the rule for formedToday",
  path: ["seaState"],
});

export interface ContractCheck {
  name: string;
  schema: { parse(value: unknown): unknown };
  run(): Promise<unknown>;
}

/** Which keys to ask for. A real implementation passes keys it knows exist. */
export interface ReadProbes {
  slots: string[];
  days: string[];
  slugs: string[];
  groupIds: string[];
  queries: string[];
  shareCards: ShareCardKey[];
}

export function readContractChecks(q: ReadQueries, probes: ReadProbes): ContractCheck[] {
  const checks: ContractCheck[] = [
    { name: "siteMeta()", schema: SiteMetaSchema, run: () => q.siteMeta() },
    { name: "edition()", schema: EditionWithSea.nullable(), run: () => q.edition() },
    { name: "editionList()", schema: EditionListSchema.nullable(), run: () => q.editionList() },
    { name: "changes()", schema: ChangesSchema, run: () => q.changes() },
    {
      name: "changes(went_flat)",
      schema: ChangesSchema,
      run: () => q.changes({ types: ["went_flat"] }),
    },
    { name: "echoes()", schema: EchoesSchema, run: () => q.echoes() },
    { name: "echoes(limit 2)", schema: EchoesSchema, run: () => q.echoes({ limit: 2 }) },
    { name: "trackRecord()", schema: TrackRecordSchema, run: () => q.trackRecord() },
    { name: "sources()", schema: SourceListSchema, run: () => q.sources() },
    { name: "search(no match)", schema: SearchResultSchema, run: () => q.search("zzzz-no-match") },
  ];
  for (const slot of probes.slots) {
    checks.push({
      name: `edition(${slot})`,
      schema: EditionWithSea,
      run: () => q.edition({ slot }),
    });
  }
  for (const day of probes.days) {
    checks.push({
      name: `editionList(${day})`,
      schema: EditionListSchema,
      run: () => q.editionList({ day }),
    });
  }
  for (const slug of probes.slugs) {
    checks.push({ name: `topic(${slug})`, schema: TopicLookupSchema, run: () => q.topic(slug) });
  }
  for (const id of probes.groupIds) {
    checks.push({ name: `source(${id})`, schema: SourceDetailSchema, run: () => q.source(id) });
  }
  for (const query of probes.queries) {
    checks.push({
      name: `search(${query})`,
      schema: SearchResultSchema,
      run: () => q.search(query),
    });
  }
  for (const key of probes.shareCards) {
    checks.push({
      name: `shareCard(${JSON.stringify(key)})`,
      schema: ShareCardDataSchema,
      run: () => q.shareCard(key),
    });
  }
  return checks;
}

export function deskContractChecks(q: DeskQueries): ContractCheck[] {
  return [
    { name: "desk.settings()", schema: DeskSettingsSchema, run: () => q.settings() },
    { name: "desk.verdictQueue()", schema: VerdictQueueSchema, run: () => q.verdictQueue() },
    {
      name: "desk.correctionTopics()",
      schema: CorrectionTopicsSchema,
      run: () => q.correctionTopics(),
    },
    { name: "desk.corrections()", schema: DeskCorrectionsSchema, run: () => q.corrections() },
    { name: "desk.scanLog()", schema: ScanLogSchema, run: () => q.scanLog() },
    { name: "desk.mail()", schema: DeskMailSchema, run: () => q.mail() },
  ];
}

/** Probes for a fixture set: every key it has. */
export function fixtureProbes(name: FixtureSetName): ReadProbes {
  const set = RAW_SETS[name];
  const shareCards = Object.keys(set.shareCards).map((key) => {
    const [kind, id, lang] = key.split(":");
    const raw = kind === "topic" ? { kind, slug: id, lang } : { kind, card: id, lang };
    return ShareCardKeySchema.parse(raw);
  });
  return {
    slots: Object.keys(set.editions),
    days: Object.keys(set.editionLists),
    slugs: Object.keys(set.topics),
    groupIds: Object.keys(set.sourceDetails),
    queries: Object.keys(set.search),
    shareCards,
  };
}
