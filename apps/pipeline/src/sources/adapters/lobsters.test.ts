import { describe, expect, test } from "bun:test";
import { ParseError } from "../adapter.ts";
import { LAUNCH_GROUPS } from "../launch-groups.ts";
import { ADAPTERS } from "./index.ts";
import { lobsters } from "./lobsters.ts";

const fixture = await Bun.file(new URL("../fixtures/lobsters.json", import.meta.url)).text();
const group = LAUNCH_GROUPS.find((g) => g.id === "lobsters");

describe("lobsters adapter", () => {
  test("reads the fixture: url or discussion page, title, date, score", () => {
    expect(lobsters.parse(fixture, "https://lobste.rs/hottest.json")).toEqual([
      {
        url: "https://example.com/item/4",
        title: "text 3",
        publishedAt: Date.UTC(2026, 10, 20, 15, 15, 2),
        heat: 42,
      },
      // A text post: its discussion page is the item.
      {
        url: "https://example.com/item/14",
        title: "text 11",
        publishedAt: Date.UTC(2026, 10, 20, 13, 40, 51),
        heat: 8,
      },
      // No usable date or score: kept, with nulls.
      { url: "https://example.com/item/20", title: "text 19", publishedAt: null, heat: null },
      // The fourth story has no title and is skipped.
    ]);
  });

  test("fetches the group's hottest list", () => {
    expect(group).toBeDefined();
    if (group) expect(lobsters.urls(group, 0)).toEqual(["https://lobste.rs/hottest.json"]);
  });

  test("stories without an absolute http(s) URL are skipped", () => {
    const body = JSON.stringify([
      { title: "a", url: "javascript:alert(1)" },
      { title: "b", url: "", comments_url: "/s/abc" },
      { title: "c", url: "https://example.com/c" },
    ]);
    expect(lobsters.parse(body, "").map((i) => i.url)).toEqual(["https://example.com/c"]);
  });

  test("a body that is not a list of stories is a ParseError", () => {
    expect(() => lobsters.parse("<html>rate limited</html>", "")).toThrow(ParseError);
    expect(() => lobsters.parse('{"error":"x"}', "")).toThrow(ParseError);
  });
});

describe("adapters", () => {
  test("each adapter is registered under its own launch group", () => {
    const ids = new Set(LAUNCH_GROUPS.map((g) => g.id));
    for (const [id, adapter] of Object.entries(ADAPTERS)) {
      expect(adapter.groupId).toBe(id);
      expect(ids.has(id)).toBe(true);
    }
  });

  test("each adapter has a fixture it reads at least one item from", async () => {
    for (const adapter of Object.values(ADAPTERS)) {
      const path = new URL(`../fixtures/${adapter.groupId}.${adapter.format}`, import.meta.url);
      const body = await Bun.file(path).text();
      expect(adapter.parse(body, "").length).toBeGreaterThan(0);
    }
  });
});
