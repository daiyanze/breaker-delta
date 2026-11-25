import { Database as SQLite } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedRun } from "../apps/pipeline/src/local/seed.ts";
import { type ChatMessage, fakeAssign, fakeSummarize } from "../packages/judge/src/index.ts";
import { runEval } from "./eval.ts";
import { loadCases } from "./eval-cases.ts";
import { main } from "./freeze-cases.ts";

/**
 * Fixtures only (invariant 6): three local runs over the scrubbed fixture
 * sources with the fake model (`seedRun`, as the preview seed does), stored
 * in a file in WAL mode, as local mode keeps `content.db` (L23).
 */
let dir: string;
let slots: string[];
let db: SQLite;
let synthetic: { topicId: string };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "bd-freeze-"));
  const run = await seedRun();
  slots = run.ticks.map((t) => t.slot);
  // The fixture sources give the same items every run, so every echo is new
  // in the first slot, when no topic exists yet. One synthetic echo in the
  // second slot, titled after a topic, has a shortlist to freeze.
  const topic = run.sqlite.query("SELECT id, name FROM topics ORDER BY id LIMIT 1").get() as {
    id: string;
    name: string;
  };
  synthetic = { topicId: topic.id };
  const second = run.sqlite
    .query("SELECT started_at FROM runs WHERE slot = ?")
    .get(slots[1] ?? "") as {
    started_at: number;
  };
  run.sqlite
    .query(
      `INSERT INTO echoes (id, url, group_id, title, first_seen_at, first_slot)
       VALUES ('e-synthetic', 'https://synthetic.test/1', 'synthetic', ?, ?, ?)`,
    )
    .run(`${topic.name} follow-up`, second.started_at + 1, slots[1] ?? "");
  writeFileSync(join(dir, "content.db"), run.sqlite.serialize());
  run.sqlite.close();
  const wal = new SQLite(join(dir, "content.db"));
  wal.exec("PRAGMA journal_mode = WAL");
  wal.close();
  db = new SQLite(join(dir, "content.db"));
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function freezeAll(out: string) {
  const lines: string[] = [];
  for (const slot of slots) {
    const code = await main(["--slot", slot, "--data-dir", dir, "--out", out], {
      out: (l) => lines.push(l),
      env: {},
    });
    expect(code).toBe(0);
  }
  return lines;
}

describe("freeze-cases", () => {
  test("is on a WAL-mode file", () => {
    expect((db.query("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe(
      "wal",
    );
  });

  test("freezes every slot's assign batches and summaries as cases the eval reads", async () => {
    const out = join(dir, "cases-1");
    await freezeAll(out);
    const cases = loadCases(out);
    const firstSlot = db.query(
      "SELECT id FROM echoes WHERE first_slot = ? ORDER BY first_seen_at, id",
    );
    const frozen = cases.assign.flatMap((c) => c.input.echoes.map((e) => e.id));
    const stored = slots.flatMap((s) => (firstSlot.all(s) as { id: string }[]).map((r) => r.id));
    expect(frozen).toEqual(stored);
    expect(cases.assign.every((c) => c.frozenFrom && slots.includes(c.frozenFrom))).toBe(true);
    // Slot 1 had no topics before it; slot 2's echo gets the topics of slot 1,
    // the one it was titled after first.
    expect(
      cases.assign
        .filter((c) => c.frozenFrom === slots[0])
        .every((c) => c.input.topics.length === 0),
    ).toBe(true);
    const later = cases.assign.filter((c) => c.frozenFrom === slots[1]);
    expect(later.map((c) => c.input.echoes.map((e) => e.id))).toEqual([["e-synthetic"]]);
    expect(later[0]?.input.topics[0]?.id).toBe(synthetic.topicId);
    expect(later[0]?.input.topics.length).toBeGreaterThan(1);

    const summarized = db
      .query(
        "SELECT topic_id, max(reason = 'formed') AS first FROM summaries GROUP BY slot, topic_id",
      )
      .all() as { topic_id: string; first: number }[];
    expect(summarized.length).toBeGreaterThan(0);
    expect(cases.summarize).toHaveLength(summarized.length);
    expect(cases.summarize.filter((c) => c.input.first)).toHaveLength(
      summarized.filter((s) => s.first === 1).length,
    );
    for (const c of cases.summarize) expect(c.input.languages).toEqual(["en", "zh", "ja"]);
    for (const c of cases.assign) expect(c).not.toHaveProperty("labels");
  });

  test("a case holds what the model sees and nothing else from the database", async () => {
    const out = join(dir, "cases-2");
    await freezeAll(out);
    const text = ["assign", "summarize"]
      .flatMap((task) =>
        readdirSync(join(out, task)).map((f) => readFileSync(join(out, task, f), "utf8")),
      )
      .join("\n");
    const rows = db.query("SELECT url, group_id FROM echoes").all() as {
      url: string;
      group_id: string;
    }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(text).not.toContain(r.url);
      expect(text).not.toContain(`"${r.group_id}"`);
    }
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
    };
    for (const task of ["assign", "summarize"])
      for (const f of readdirSync(join(out, task)))
        walk(JSON.parse(readFileSync(join(out, task, f), "utf8")));
    expect([...keys].sort()).toEqual(
      [
        "aliases",
        "echoes",
        "first",
        "frozenFrom",
        "id",
        "input",
        "languages",
        "name",
        "summary",
        "title",
        "topics",
      ].filter((k) => keys.has(k)),
    );
    expect(keys.has("url")).toBe(false);
  });

  test("prints file names and counts only, and keeps a case that exists", async () => {
    const out = join(dir, "cases-3");
    const first = await freezeAll(out);
    const titles = (db.query("SELECT title FROM echoes").all() as { title: string }[]).map(
      (r) => r.title,
    );
    for (const t of titles) expect(first.join("\n")).not.toContain(t);
    const again = await freezeAll(out);
    expect(again.filter((l) => l.startsWith("wrote"))).toEqual(
      first
        .filter((l) => l.startsWith("wrote"))
        .map((l) => l.replace(/wrote (\d+) cases, kept 0/, "wrote 0 cases, kept $1")),
    );
  });

  test("opens a WAL file whose app is stopped (no -wal or -shm file) and does not write it", async () => {
    const copy = mkdtempSync(join(tmpdir(), "bd-freeze-stopped-"));
    try {
      writeFileSync(join(copy, "content.db"), db.serialize());
      const wal = new SQLite(join(copy, "content.db"));
      wal.exec("PRAGMA journal_mode = WAL");
      wal.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      wal.close();
      // A stopped app's file: the WAL checkpointed, its -wal and -shm files
      // gone. On macOS a read-only bun:sqlite handle cannot read that file
      // (on Linux it can), which is why freeze opens it query-only instead.
      rmSync(join(copy, "content.db-wal"), { force: true });
      rmSync(join(copy, "content.db-shm"), { force: true });
      const before = readFileSync(join(copy, "content.db"));
      const lines: string[] = [];
      const code = await main(
        ["--slot", slots[0] ?? "", "--data-dir", copy, "--out", join(copy, "out")],
        {
          out: (l) => lines.push(l),
          env: {},
        },
      );
      expect(lines[0]).toStartWith("wrote ");
      expect(code).toBe(0);
      expect(readFileSync(join(copy, "content.db")).equals(before)).toBe(true);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  test("writes to <data-dir>/eval-cases by default, which local mode's .bd-data keeps out of git", async () => {
    const lines: string[] = [];
    const code = await main(["--slot", slots[0] ?? "", "--data-dir", dir], {
      out: (l) => lines.push(l),
      env: {},
    });
    expect(code).toBe(0);
    expect(lines.slice(1).every((l) => l.trim().startsWith(join(dir, "eval-cases")))).toBe(true);
    expect(readdirSync(join(dir, "eval-cases", "assign")).length).toBeGreaterThan(0);
  });

  test("refuses to write where git would commit the cases", async () => {
    const repo = join(import.meta.dir, "..");
    const targets = [
      join(repo, "evals", "cases"),
      join(repo, "evals", "frozen"),
      join(repo, "scripts", "frozen-cases"),
    ];
    for (const target of targets) {
      const lines: string[] = [];
      const code = await main(["--slot", slots[0] ?? "", "--data-dir", dir, "--out", target], {
        out: (l) => lines.push(l),
        env: {},
      });
      expect(code).toBe(2);
      expect(lines[0]).toContain("not git-ignored");
      expect(existsSync(target)).toBe(false);
    }
  });

  test("writes inside the repository only to a git-ignored folder", async () => {
    const target = join(import.meta.dir, "..", ".bd-data", `freeze-test-${process.pid}`);
    try {
      const code = await main(["--slot", slots[0] ?? "", "--data-dir", dir, "--out", target], {
        out: () => {},
        env: {},
      });
      expect(code).toBe(0);
      expect(readdirSync(join(target, "assign")).length).toBeGreaterThan(0);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("an unknown slot or a missing database is an error", async () => {
    const lines: string[] = [];
    const io = { out: (l: string) => lines.push(l), env: {} };
    expect(await main(["--slot", "nope", "--data-dir", dir, "--out", join(dir, "x")], io)).toBe(1);
    expect(await main(["--slot", "nope", "--data-dir", join(dir, "none")], io)).toBe(2);
    expect(lines[0]).toBe("no run for slot nope");
  });

  test("end to end: frozen cases through a stand-in prompt and model", async () => {
    const out = join(dir, "cases-4");
    await freezeAll(out);
    const cases = loadCases(out);
    // Stand-in prompt: the input as JSON; stand-in model: the deterministic fake.
    const prompt = <I>(version: string) => ({
      version,
      messages: (input: I): ChatMessage[] => [{ role: "user", content: JSON.stringify(input) }],
    });
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const input = JSON.parse(JSON.parse(String(init?.body)).messages[0].content);
      const answer = "topics" in input ? fakeAssign(input) : fakeSummarize(input);
      return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
    }) as typeof fetch;
    const chain = [{ name: "stand-in", baseUrl: "https://stand-in.test/v1", model: "fake" }];
    const tasks = await runEval({
      prompts: { assign: prompt("assign-x"), summarize: prompt("summarize-x") },
      cases,
      providers: { assign: chain, summarize: chain },
      secret: () => undefined,
      fetch: fetchImpl,
    });
    const echoes = cases.assign.reduce((n, c) => n + c.input.echoes.length, 0);
    expect(tasks.map((t) => t.status === "ran" && t.metrics)).toEqual([
      {
        contract: { n: cases.assign.length, of: cases.assign.length },
        citations: { n: echoes, of: echoes },
        repaired: { n: 0, of: cases.assign.length },
        fallback: { n: 0, of: cases.assign.length },
      },
      expect.objectContaining({
        contract: { n: cases.summarize.length, of: cases.summarize.length },
        publishable: { n: cases.summarize.length, of: cases.summarize.length },
      }),
    ]);
  });
});
