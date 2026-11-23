/**
 * Verification-layer adapters (M1-08). The `@ts-expect-error` lines are the
 * type-level proof that they cannot produce echoes: if any of those
 * assignments ever compiled, the directive would be unused and `tsc`
 * (`tsconfig.bun.json`, in `bun run check`) would fail.
 */
import { describe, expect, test } from "bun:test";
import { type Adapter, ParseError, type SourceItem } from "../adapter.ts";
import { ADAPTERS } from "../adapters/index.ts";
import { LAUNCH_GROUPS } from "../launch-groups.ts";
import type { Evidence, VerificationAdapter } from "../verification.ts";
import { VERIFICATION_ADAPTERS } from "./index.ts";
import { type PageviewsEvidence, wikipediaPageviews } from "./wikipedia-pageviews.ts";

const fixture = () =>
  Bun.file(new URL("../fixtures/wikipedia_pageviews.json", import.meta.url)).text();

const sample: PageviewsEvidence = {
  kind: "pageviews",
  article: "Example_topic",
  url: "https://en.wikipedia.org/wiki/Example_topic",
  day: Date.UTC(2026, 10, 16),
  views: 1520,
};

describe("by type, verification adapters cannot produce echoes", () => {
  test("evidence is not a SourceItem", () => {
    // @ts-expect-error Evidence has no `heat`, which SourceItem requires.
    const asItem: SourceItem = sample;
    // @ts-expect-error A list of evidence is not a list of items.
    const asItems: SourceItem[] = [sample] as ReturnType<typeof wikipediaPageviews.parse>;
    const anyEvidence: Evidence = sample;
    // @ts-expect-error Not even the base type, whatever kind it is.
    const baseAsItem: SourceItem = anyEvidence;
    expect([asItem, asItems, baseAsItem]).toBeDefined();
  });

  test("a verification adapter is not an Adapter", () => {
    // @ts-expect-error No `groupId`, and `urls` and `parse` differ.
    const asAdapter: Adapter = wikipediaPageviews;
    // @ts-expect-error It cannot be registered with the adapters that yield echoes.
    const registry: Record<string, Adapter> = { wikipedia_pageviews: wikipediaPageviews };
    expect([asAdapter, registry]).toBeDefined();
  });

  test("an adapter that also claimed a fetch group would not compile", () => {
    // Declarations, not object literals: a literal with an unknown field is
    // refused with or without the guard, an `extends` only by the guard.
    // @ts-expect-error `groupId` is typed never on a verification adapter.
    interface Pretender extends VerificationAdapter {
      groupId: string;
    }
    // @ts-expect-error Evidence that also carried a heat would not compile either.
    interface Heated extends Evidence {
      heat: number | null;
    }
    // @ts-expect-error Nor evidence that took on every field of a SourceItem.
    interface EvidenceItem extends Evidence, SourceItem {}
    const names: (keyof Pretender | keyof Heated | keyof EvidenceItem)[] = ["kind"];
    expect(names).toEqual(["kind"]);
  });

  test("no verification source is a fetch group or in ADAPTERS", () => {
    const groups = new Set(LAUNCH_GROUPS.map((g) => g.id));
    for (const id of Object.keys(VERIFICATION_ADAPTERS)) {
      expect(ADAPTERS[id]).toBeUndefined();
      expect(groups.has(id)).toBe(false);
    }
    const adapters: unknown[] = Object.values(ADAPTERS);
    for (const v of Object.values(VERIFICATION_ADAPTERS)) expect(adapters).not.toContain(v);
    expect(Object.keys(VERIFICATION_ADAPTERS)).toEqual(["wikipedia_pageviews"]);
  });
});

describe("wikipedia_pageviews", () => {
  test("reads its fixture: one record per day, dated by the API's timestamp", async () => {
    const days = wikipediaPageviews.parse(await fixture(), "");
    expect(days).toHaveLength(5);
    expect(days[0]).toEqual(sample);
    expect(days.map((d) => d.day)).toEqual([16, 17, 18, 19, 20].map((d) => Date.UTC(2026, 10, d)));
    expect(days.map((d) => d.views)).toEqual([1520, 1488, 9731, 6204, 3310]);
  });

  test("asks for one article's daily views by people over the query's UTC days", () => {
    const urls = wikipediaPageviews.urls({
      subject: " Example topic ",
      from: Date.UTC(2026, 10, 9, 23, 59),
      to: Date.UTC(2026, 10, 23, 0, 1),
    });
    expect(urls).toEqual([
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Example_topic/daily/20261109/20261123",
    ]);
  });

  test("escapes the title as one path segment", () => {
    const [url] = wikipediaPageviews.urls({ subject: "AC/DC?", from: 0, to: 0 });
    expect(url).toContain("/user/AC%2FDC%3F/daily/19700101/19700101");
  });

  test("no subject, or an empty or invalid range, fetches nothing", () => {
    const day = Date.UTC(2026, 10, 23);
    expect(wikipediaPageviews.urls({ subject: " ", from: day, to: day })).toEqual([]);
    expect(wikipediaPageviews.urls({ subject: "X", from: day + 1, to: day })).toEqual([]);
    expect(wikipediaPageviews.urls({ subject: "X", from: Number.NaN, to: day })).toEqual([]);
  });

  test("the evidence URL is the article's page, written as Wikipedia links it", () => {
    const body = JSON.stringify({
      items: [
        {
          project: "en.wikipedia",
          article: "AC/DC",
          granularity: "daily",
          timestamp: "2026112200",
          access: "all-access",
          agent: "user",
          views: 7,
        },
      ],
    });
    expect(wikipediaPageviews.parse(body, "")[0]?.url).toBe("https://en.wikipedia.org/wiki/AC/DC");
  });

  test("skips entries it cannot use: not daily, a bad timestamp, no views, no article", () => {
    const base = { project: "en.wikipedia", article: "A", access: "all-access", agent: "user" };
    const body = JSON.stringify({
      items: [
        { ...base, granularity: "monthly", timestamp: "2026110100", views: 9 },
        { ...base, granularity: "daily", timestamp: "2026113200", views: 9 },
        { ...base, granularity: "daily", timestamp: "2026-11-22", views: 9 },
        { ...base, granularity: "daily", timestamp: "2026112213", views: 9 },
        { ...base, granularity: "daily", timestamp: "2026112200", views: null },
        { ...base, article: "", granularity: "daily", timestamp: "2026112200", views: 9 },
        { ...base, granularity: "daily", timestamp: "2026112200", views: "12" },
      ],
    });
    expect(wikipediaPageviews.parse(body, "")).toEqual([
      {
        kind: "pageviews",
        article: "A",
        url: "https://en.wikipedia.org/wiki/A",
        day: Date.UTC(2026, 10, 22),
        views: 12,
      },
    ]);
  });

  test("refuses a body of the wrong shape; an empty list is no evidence", () => {
    for (const bad of ["<html>rate limited</html>", "[]", "null", '{"items":{}}']) {
      expect(() => wikipediaPageviews.parse(bad, "")).toThrow(ParseError);
    }
    expect(wikipediaPageviews.parse('{"items":[]}', "")).toEqual([]);
  });
});
