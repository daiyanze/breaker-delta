import { describe, expect, test } from "bun:test";
import {
  ChangesSchema,
  CorrectionTopicsSchema,
  DeskCorrectionsSchema,
  DeskMailSchema,
  DeskSettingsSchema,
  EchoesSchema,
  EditionListSchema,
  EditionSchema,
  type Language,
  ScanLogSchema,
  SearchResultSchema,
  ShareCardDataSchema,
  SiteMetaSchema,
  SourceDetailSchema,
  SourceListSchema,
  TopicLookupSchema,
  type TopicPage,
  TrackRecordSchema,
  VerdictQueueSchema,
} from "@bd/contracts";
import { deskContractChecks, fixtureProbes, readContractChecks } from "./contract.ts";
import { createFixtureDeskQueries, createFixtureReadQueries, shareCardKey } from "./index.ts";
import { FIXTURE_SET_NAMES, type FixtureSetName, RAW_SETS } from "./sets.ts";

type Schema = { parse(value: unknown): unknown };

/** File name -> schema. Map files hold one value per key. */
const FILES: Record<string, { schema: Schema; map: boolean }> = {
  siteMeta: { schema: SiteMetaSchema, map: false },
  editions: { schema: EditionSchema, map: true },
  editionLists: { schema: EditionListSchema, map: true },
  changes: { schema: ChangesSchema, map: false },
  topics: { schema: TopicLookupSchema, map: true },
  echoes: { schema: EchoesSchema, map: false },
  trackRecord: { schema: TrackRecordSchema, map: false },
  sources: { schema: SourceListSchema, map: false },
  sourceDetails: { schema: SourceDetailSchema, map: true },
  search: { schema: SearchResultSchema, map: true },
  shareCards: { schema: ShareCardDataSchema, map: true },
  deskSettings: { schema: DeskSettingsSchema, map: false },
  deskVerdictQueue: { schema: VerdictQueueSchema, map: false },
  deskCorrectionTopics: { schema: CorrectionTopicsSchema, map: false },
  deskCorrections: { schema: DeskCorrectionsSchema, map: false },
  deskScanLog: { schema: ScanLogSchema, map: false },
  deskMail: { schema: DeskMailSchema, map: false },
};

function topicPages(name: FixtureSetName): TopicPage[] {
  return Object.values(RAW_SETS[name].topics)
    .map((raw) => TopicLookupSchema.parse(raw))
    .flatMap((lookup) => (lookup.kind === "topic" ? [lookup.topic] : []));
}

/** Every `{ lang, text }` pair anywhere in a value. */
function texts(value: unknown, out: { lang: string; text: string }[] = []) {
  if (Array.isArray(value)) {
    for (const v of value) texts(v, out);
  } else if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.lang === "string" && typeof o.text === "string") {
      out.push({ lang: o.lang, text: o.text });
    }
    for (const v of Object.values(o)) texts(v, out);
  }
  return out;
}

describe("every fixture file passes its read contract", () => {
  for (const name of FIXTURE_SET_NAMES) {
    const set = RAW_SETS[name] as Record<string, unknown>;
    test(`${name}: has exactly the expected files`, () => {
      expect(Object.keys(set).sort()).toEqual(Object.keys(FILES).sort());
    });
    for (const [file, { schema, map }] of Object.entries(FILES)) {
      test(`${name}/${file}`, () => {
        const raw = set[file];
        const values = map ? Object.values(raw as Record<string, unknown>) : [raw];
        // Equal after parsing: no field outside the contract, no default filled in.
        for (const value of values) expect(schema.parse(value)).toEqual(value);
      });
    }
  }
});

describe("the fixture query layer passes the contract checks", () => {
  for (const name of FIXTURE_SET_NAMES) {
    const read = readContractChecks(createFixtureReadQueries(name), fixtureProbes(name));
    const desk = deskContractChecks(createFixtureDeskQueries(name));
    for (const check of [...read, ...desk]) {
      test(`${name}: ${check.name}`, async () => {
        check.schema.parse(await check.run());
      });
    }
  }
});

describe("the cases from issue #162 each have a fixture", () => {
  const busy = RAW_SETS.busy;
  const quiet = RAW_SETS.quiet;
  const fresh = RAW_SETS.fresh;

  test("a fresh install with no scan yet", async () => {
    const q = createFixtureReadQueries("fresh");
    expect(fresh.siteMeta.lastRunAt).toBeNull();
    expect(await q.edition()).toBeNull();
    expect((await q.trackRecord()).registered).toBe(0);
  });

  test("a quiet front page with one or two waves", async () => {
    const edition = await createFixtureReadQueries("quiet").edition();
    expect(edition?.ranking.length).toBeGreaterThanOrEqual(1);
    expect(edition?.ranking.length).toBeLessThanOrEqual(2);
  });

  test("no verdict yet", () => {
    const record = TrackRecordSchema.parse(quiet.trackRecord);
    expect(record.score.confirmed).toBe(0);
    expect(record.score.rate).toBeNull();
    expect(record.firstDueAt).not.toBeNull();
  });

  test("a run interval that is not 60 minutes", () => {
    expect(quiet.siteMeta.runIntervalMinutes).not.toBe(60);
  });

  test("one enabled language only", () => {
    expect(quiet.siteMeta.languages).toHaveLength(1);
  });

  test("a flat topic", () => {
    expect(topicPages("busy").some((t) => t.state === "flat" && t.wentFlatAt !== null)).toBe(true);
  });

  test("a merged topic, and a redirect from the folded-in slug", () => {
    const pages = topicPages("busy");
    const merged = pages.find((t) => t.mergedFrom.length > 0);
    expect(merged).toBeDefined();
    const from = (merged?.mergedFrom[0]?.slug ?? "") as keyof typeof busy.topics;
    const lookup = TopicLookupSchema.parse(busy.topics[from]);
    expect(lookup).toEqual({ kind: "redirect", to: merged?.slug ?? "" });
  });

  test("a revised verdict", () => {
    const record = TrackRecordSchema.parse(busy.trackRecord);
    const revised = record.ledger.filter((row) => row.prediction.verdicts.some((v) => v.revises));
    expect(revised.length).toBeGreaterThan(0);
    expect(record.marks.some((m) => m.revised)).toBe(true);
  });

  test("each of the five summary states", () => {
    const seen = topicPages("busy").flatMap((t) => {
      const s = t.summary;
      if (s.status !== "published") return [s.status];
      return s.labels.length === 0 ? ["published"] : s.labels;
    });
    const five = ["none", "published", "source_text_not_read", "unverified", "withdrawn"];
    expect([...new Set(seen)].sort()).toEqual(five);
  });

  test("a failing source", () => {
    const sources = SourceListSchema.parse(busy.sources);
    expect(sources.groups.some((g) => g.status.state === "failing")).toBe(true);
  });

  test("every change type appears", () => {
    const changes = ChangesSchema.parse(busy.changes);
    const types = new Set(changes.runs.flatMap((r) => r.changes.map((c) => c.type)));
    expect(types.size).toBe(7);
  });
});

describe("rules that hold in every set", () => {
  for (const name of FIXTURE_SET_NAMES) {
    const set = RAW_SETS[name];
    const meta = SiteMetaSchema.parse(set.siteMeta);
    const langs: readonly string[] = meta.languages;

    test(`${name}: site text is only in enabled languages`, () => {
      // Original texts (echo titles, source headlines) carry the source's language;
      // every fixture source here publishes in English.
      for (const t of texts(set)) {
        expect(langs.includes(t.lang) || t.lang === "en").toBe(true);
      }
      for (const page of topicPages(name)) {
        for (const h of page.headlines) expect(langs).toContain(h.lang as Language);
      }
    });

    test(`${name}: summaries cite only echoes in their topic`, () => {
      for (const page of topicPages(name)) {
        if (page.summary.status !== "published") continue;
        const ids = new Set(page.clippings.map((c) => c.id));
        for (const id of page.summary.evidenceEchoIds) expect(ids.has(id)).toBe(true);
      }
    });

    test(`${name}: echo URLs are on the echo's own source`, () => {
      for (const page of topicPages(name)) {
        for (const c of page.clippings) expect(c.url).toContain(c.groupId.replaceAll("_", "-"));
      }
    });

    test(`${name}: editions rank by height, and the tide table points into the ranking`, () => {
      for (const raw of Object.values(set.editions)) {
        const e = EditionSchema.parse(raw);
        expect(e.waveCount).toBe(e.ranking.length);
        for (const [i, row] of e.ranking.entries()) {
          expect(row.rank).toBe(i + 1);
          if (i > 0) expect(row.height).toBeLessThanOrEqual(e.ranking[i - 1]?.height ?? 0);
        }
        const slugs = new Set(e.ranking.map((r) => r.slug));
        for (const tide of e.tideTable) expect(slugs.has(tide.slug)).toBe(true);
      }
    });

    test(`${name}: edition slots follow the run interval`, () => {
      for (const raw of Object.values(set.editionLists)) {
        const list = EditionListSchema.parse(raw);
        const starts = list.slots.map((s) => Date.parse(s.startsAt));
        for (let i = 1; i < starts.length; i++) {
          expect((starts[i] ?? 0) - (starts[i - 1] ?? 0)).toBe(meta.runIntervalMinutes * 60_000);
        }
      }
    });

    test(`${name}: the settings the site reads are the set's settings (#303)`, () => {
      const settings = DeskSettingsSchema.parse(set.deskSettings).current;
      expect(meta.tideMinWaves).toBe(settings.tideMinWaves);
      expect(meta.reviewWindowDays).toBe(settings.reviewWindowDays);
      expect(meta.runIntervalMinutes).toBe(settings.runIntervalMinutes);
    });

    test(`${name}: share card keys match their cards`, () => {
      for (const [key, raw] of Object.entries(set.shareCards)) {
        const card = ShareCardDataSchema.parse(raw);
        if (card.card === "topic") {
          expect(key).toBe(shareCardKey({ kind: "topic", slug: card.slug, lang: card.lang }));
        } else {
          expect(key).toBe(shareCardKey({ kind: "site", card: card.card, lang: card.lang }));
        }
      }
    });

    test(`${name}: no fixture holds an email address`, () => {
      expect(JSON.stringify(set)).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    });
  }
});
