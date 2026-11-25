/**
 * The preview seed (#41): runs over the scrubbed fixture sources with the
 * fake model, exported as SQL, loads into a fresh database with waves and
 * echoes, holds no fetched text, and loads into a seeded database as a no-op.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { buildSeed, SEED_RUNS, sqlLiteral } from "../src/local/seed.ts";
import { migratedDatabase } from "./helpers.ts";

/**
 * What `scrub.ts` leaves of a fetched string: placeholders (`text 12`), plus
 * at most one identifier it keeps as vocabulary (a repository name an adapter
 * puts before a release title). No run of words.
 */
function scrubbed(text: string): boolean {
  return /text \d+/.test(text) && /^\S*$/.test(text.replace(/text \d+/g, "").trim());
}
/** The fake model's marks (`@bd/judge`), in every language it writes. */
const FAKE = /^\[(fake|模拟|模擬)\]/;

let sql = "";
beforeAll(async () => {
  sql = await buildSeed();
});

function seeded() {
  const { sqlite } = migratedDatabase();
  sqlite.exec(sql);
  const q = <T>(query: string) => sqlite.query(query).all() as T[];
  const count = (table: string) => q<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)[0]?.n;
  return { sqlite, q, count };
}

describe("preview seed", () => {
  test("a fresh database gets finished runs, waves and echoes", () => {
    const { q, count } = seeded();
    const runs = q<{ status: string }>("SELECT status FROM runs");
    expect(runs.map((r) => r.status)).toEqual(Array(SEED_RUNS).fill("done"));
    expect(count("echoes")).toBeGreaterThan(0);
    const waves = q<{ id: string }>("SELECT id FROM topics WHERE state = 'up'");
    expect(waves.length).toBeGreaterThan(0);
    // Each wave has a published summary, a prediction, a formed event, and a
    // height in every seeded run.
    for (const { id } of waves) {
      const one = (query: string) => q<{ n: number }>(query.replace("?", `'${id}'`))[0]?.n;
      expect(
        one("SELECT count(*) AS n FROM summaries WHERE topic_id = ? AND status = 'published'"),
      ).toBeGreaterThan(0);
      expect(one("SELECT count(*) AS n FROM predictions WHERE topic_id = ?")).toBe(1);
      expect(
        one("SELECT count(*) AS n FROM events WHERE topic_id = ? AND type = 'wave_formed'"),
      ).toBe(1);
      expect(one("SELECT count(DISTINCT slot) AS n FROM wave_points WHERE topic_id = ?")).toBe(
        SEED_RUNS,
      );
    }
  });

  test("holds no fetched text: placeholders and fake texts only", () => {
    const { q } = seeded();
    for (const e of q<{ title: string; excerpt: string | null }>(
      "SELECT title, excerpt FROM echoes",
    )) {
      expect(scrubbed(e.title)).toBe(true);
      if (e.excerpt !== null) expect(scrubbed(e.excerpt)).toBe(true);
    }
    for (const t of q<{ name: string }>("SELECT name FROM topics")) {
      expect(scrubbed(t.name)).toBe(true);
    }
    const bodies = q<{ body: string }>("SELECT body FROM summary_texts");
    expect(bodies.length).toBeGreaterThan(0);
    for (const s of bodies) expect(s.body).toMatch(FAKE);
    for (const p of q<{ criterion: string }>("SELECT criterion FROM predictions")) {
      expect(p.criterion).toMatch(FAKE);
    }
  });

  test("summaries cite seeded echoes by id", () => {
    const { q } = seeded();
    const orphans = q(
      "SELECT echo_id FROM summary_evidence WHERE echo_id NOT IN (SELECT id FROM echoes)",
    );
    expect(orphans).toEqual([]);
    expect(q("SELECT 1 FROM summary_evidence").length).toBeGreaterThan(0);
  });

  test("leaves settings to the deployment", () => {
    expect(sql).not.toContain('INSERT INTO "settings"');
    expect(sql).not.toContain('INSERT INTO "settings_history"');
  });

  test("loading it again, or into a database that ran, changes nothing", () => {
    const { sqlite, count } = seeded();
    const tables = ["runs", "echoes", "topics", "wave_points", "summaries", "events"];
    const before = tables.map(count);
    sqlite.exec(sql);
    expect(tables.map(count)).toEqual(before);

    const { sqlite: ran } = migratedDatabase();
    ran.exec("INSERT INTO runs (slot, status, started_at) VALUES ('20261101T0000', 'done', 0)");
    ran.exec(sql);
    expect(ran.query("SELECT count(*) AS n FROM echoes").get()).toEqual({ n: 0 });
  });

  test("the same counts every time", async () => {
    const again = await buildSeed();
    const shape = (s: string) =>
      s
        .split("\n")
        .filter((line) => !line.startsWith("--"))
        .map((line) => line.match(/^INSERT INTO "\w+"|^\s+\(/)?.[0] ?? "")
        .join(",");
    expect(shape(again)).toBe(shape(sql));
  });
});

describe("sqlLiteral", () => {
  test("quotes strings, keeps numbers, writes NULL and blobs", () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral(1.5)).toBe("1.5");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(new Uint8Array([0, 255]))).toBe("X'00ff'");
    expect(() => sqlLiteral(Number.NaN)).toThrow();
  });

  test("round-trips through SQLite", () => {
    const { sqlite } = migratedDatabase();
    const values = ["a'b\nc", '关于"x"', 0.1 + 0.2, -3, null];
    const row = sqlite.query(`SELECT ${values.map(sqlLiteral).join(", ")}`).values()[0];
    expect(row).toEqual(values);
  });
});
