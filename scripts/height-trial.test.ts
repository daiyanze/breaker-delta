/**
 * The height trial on a temp database seeded with synthetic rows only. No
 * test here reads `.bd-data`, fetched data, or runs `--collect`.
 */
import { Database as SQLite } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../apps/pipeline/src/local/migrate.ts";
import { SettingsSchema } from "../packages/contracts/src/index.ts";
import {
  builtInSets,
  cleanTitle,
  HELP,
  loadClusters,
  parseSets,
  score,
  trial,
  WARNING,
} from "./height-trial.ts";

const NOW = Date.UTC(2026, 11, 1, 12, 0, 0);
const HOUR = 3_600_000;

function seed(): { dir: string; sqlite: SQLite } {
  const dir = mkdtempSync(join(tmpdir(), "bd-height-trial-"));
  const sqlite = new SQLite(join(dir, "content.db"), { create: true });
  migrate(sqlite);
  const topic = sqlite.query(
    "INSERT INTO topics (id, slug, name, created_at, merged_into) VALUES (?1, ?1, ?1, ?2, ?3)",
  );
  topic.run("t-big", NOW - 10 * HOUR, null);
  topic.run("t-old", NOW - 10 * HOUR, "t-big"); // merged into t-big
  topic.run("t-flood", NOW - 10 * HOUR, null);
  const echo = sqlite.query(
    `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot, topic_id)
     VALUES (?1, ?2, ?3, ?4, ?5, '20261201T0000', ?6)`,
  );
  const heat = sqlite.query(
    "INSERT INTO echo_metrics (echo_id, slot, heat, seen_at) VALUES (?1, ?2, ?3, ?4)",
  );
  const add = (
    id: string,
    group: string,
    topicId: string | null,
    ageH: number,
    heats: number[],
  ) => {
    echo.run(
      id,
      `https://example.test/${id}`,
      group,
      `Synthetic ${id}`,
      NOW - ageH * HOUR,
      topicId,
    );
    heats.forEach((h, i) => {
      heat.run(id, `20261201T0${i}00`, h, NOW - ageH * HOUR + i * HOUR);
    });
  };
  // t-big: three groups, one echo through a merged topic.
  add("b1", "hn", "t-big", 2, [10, 300]); // latest heat 300
  add("b2", "github", "t-big", 3, [5000]);
  add("b3", "lobsters", "t-old", 1, [20]);
  // t-flood: thirty cold echoes from one group.
  for (let i = 0; i < 30; i++) add(`f${i}`, "google_news", "t-flood", 1, [0]);
  // Unassigned singletons.
  add("s1", "hn", null, 1, [800]);
  add("s2", "github", null, 1, []); // no heat row: heat 0
  // Too old for a 7-day window.
  add("old", "hn", null, 24 * 9, [9999]);
  return { dir, sqlite };
}

describe("height trial", () => {
  test("help and output carry the invariant 6 warning", () => {
    expect(HELP).toContain("Do not paste its output into a coding agent session");
    expect(WARNING).toContain("share only topic ids and numbers");
  });

  test("clusters by topic, following merges; unassigned echoes stand alone", () => {
    const { sqlite } = seed();
    const clusters = loadClusters(sqlite, NOW - 7 * 24 * HOUR);
    const byId = new Map(clusters.map((c) => [c.id, c]));
    expect([...byId.keys()].sort()).toEqual(["s1", "s2", "t-big", "t-flood"]);
    expect(byId.get("t-big")?.sources).toBe(3);
    expect(
      byId
        .get("t-big")
        ?.echoes.map((e) => e.id)
        .sort(),
    ).toEqual(["b1", "b2", "b3"]);
    expect(byId.get("t-big")?.title).toBe("Synthetic b2"); // first seen
    expect(byId.get("t-big")?.echoes.find((e) => e.id === "b1")?.heat).toBe(300);
    expect(byId.get("s2")?.echoes[0]?.heat).toBe(0);
    expect(byId.get("t-flood")?.sources).toBe(1);
    expect(byId.get("t-flood")?.echoes).toHaveLength(30);
  });

  test("the cap moves a one-group flood down; ranks and moves are printed", () => {
    const { sqlite } = seed();
    const clusters = loadClusters(sqlite, NOW - 7 * 24 * HOUR);
    const sets = builtInSets(SettingsSchema.parse({}));
    const rows = score(clusters, sets, NOW);
    const flood = rows.find((r) => r.cluster.id === "t-flood");
    expect(flood?.ranks[0]).toBe(1); // thirty echoes add up under the defaults
    expect(flood?.ranks[1]).toBeGreaterThan(1); // cap3 counts three of them
    expect(rows[0]?.heights[0]).toBeGreaterThan(rows[1]?.heights[0] as number);

    const out = trial({ dataDir: seed().dir, top: 2, days: 7, nowMs: NOW });
    expect(out).toContain("4 clusters from 35 echoes");
    expect(out).toContain("cap3 (rank, move)");
    expect(out).toMatch(/1\s+t-flood\s+1\s+30\s/);
    expect(out).toContain("cap3: also in its top 2: s1 (#2)"); // something entered under another set
  });

  test("sets from JSON start from the stored settings and are validated", () => {
    const { dir, sqlite } = seed();
    sqlite
      .query("INSERT INTO settings (id, json, updated_at) VALUES (1, ?1, ?2)")
      .run(JSON.stringify({ ...SettingsSchema.parse({}), heightScale: 2 }), NOW);
    const base = SettingsSchema.parse({ heightScale: 2 });
    const sets = parseSets([{ name: "a" }, { name: "b", sourceBonus: 2 }], base);
    expect(sets[0]?.settings.heightScale).toBe(2);
    expect(sets[1]?.settings.sourceBonus).toBe(2);
    expect(() => parseSets([{ name: "a" }], base)).toThrow("2 to 4");
    expect(() => parseSets([{}, { sourceBonus: -1 }], base)).toThrow("sourceBonus");
    expect(() => parseSets([{}, { feedLimit: 5 }], base)).toThrow("unknown keys feedLimit");
    const out = trial({
      dataDir: dir,
      top: 20,
      days: 7,
      nowMs: NOW,
      sets: [{ name: "x" }, { name: "y", heightScale: 4 }],
    });
    expect(out).toContain("x: halfLifeHours=24 heightScale=2");
    expect(out).toContain("y: halfLifeHours=24 heightScale=4");
  });

  test("a missing database is an error that names the fix", () => {
    const dir = mkdtempSync(join(tmpdir(), "bd-height-trial-"));
    expect(() => trial({ dataDir: dir, top: 20, days: 7, nowMs: NOW })).toThrow("bun run local");
  });

  test("titles lose control characters and are cut to one bounded line", () => {
    expect(cleanTitle("a\u001b[31mred\u0007\nnext‮line")).toBe("a [31mred next line");
    expect(cleanTitle("x".repeat(80), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
