import { Database as SQLite } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enrichKey } from "../apps/pipeline/src/core/enrich.ts";
import { seedRun } from "../apps/pipeline/src/local/seed.ts";
import { type ChatMessage, fakeAssign, fakeSummarize } from "../packages/judge/src/index.ts";
import { runEval } from "./eval.ts";
import { loadCases } from "./eval-cases.ts";
import { gitTracks, main } from "./freeze-cases.ts";

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

  /**
   * A throwaway git repository with its own .gitignore, so the guard is
   * exercised without the real tree: a broken guard writes there, never into
   * the repository's evals/cases/, and committed cases there cannot break it.
   */
  function tempRepo(): string {
    const repo = mkdtempSync(join(tmpdir(), "bd-freeze-repo-"));
    const init = spawnSync("git", ["init", "-q", repo]);
    expect(init.status).toBe(0);
    writeFileSync(join(repo, ".gitignore"), ".bd-data/\n");
    // A committed case, like those #43 and #44 added.
    mkdirSync(join(repo, "evals", "cases", "assign"), { recursive: true });
    writeFileSync(join(repo, "evals", "cases", "assign", "synthetic.json"), "{}\n");
    return repo;
  }

  function files(root: string): string[] {
    return existsSync(root) ? readdirSync(root, { recursive: true }).map(String).sort() : [];
  }

  test("refuses to write where git would commit the cases, and writes nothing there", async () => {
    const repo = tempRepo();
    try {
      for (const target of [
        join(repo, "evals", "cases"),
        join(repo, "evals", "frozen"),
        join(repo, "scripts", "frozen-cases"),
        join(repo, ".bd-data", "..", "evals", "cases"),
      ]) {
        const before = files(repo);
        const lines: string[] = [];
        const code = await main(["--slot", slots[0] ?? "", "--data-dir", dir, "--out", target], {
          out: (l) => lines.push(l),
          env: {},
        });
        expect(code).toBe(2);
        expect(lines[0]).toContain("not git-ignored");
        expect(files(repo)).toEqual(before);
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("writes inside a repository only to a git-ignored folder", async () => {
    const repo = tempRepo();
    try {
      const target = join(repo, ".bd-data", "eval-cases");
      const code = await main(["--slot", slots[0] ?? "", "--data-dir", dir, "--out", target], {
        out: () => {},
        env: {},
      });
      expect(code).toBe(0);
      expect(readdirSync(join(target, "assign")).length).toBeGreaterThan(0);
      expect(files(join(repo, "evals"))).toEqual([
        "cases",
        "cases/assign",
        "cases/assign/synthetic.json",
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("gitTracks fails closed when git cannot run, and allows a folder outside any repository", () => {
    const repo = tempRepo();
    try {
      expect(gitTracks(join(repo, ".bd-data", "x"))).toBe(false);
      expect(gitTracks(join(repo, ".bd-data", "x"), "/nonexistent/git-for-this-test")).toBe(true);
      expect(gitTracks(join(dir, "anywhere"))).toBe(false);
      expect(gitTracks(join(dir, "anywhere"), "/nonexistent/git-for-this-test")).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("a summary written with page text whose stored pages match no offered echo is skipped, not frozen without them", async () => {
    const copy = mkdtempSync(join(tmpdir(), "bd-freeze-nomatch-"));
    try {
      writeFileSync(join(copy, "content.db"), db.serialize());
      const c = new SQLite(join(copy, "content.db"));
      const one = c
        .query("SELECT slot, topic_id AS topicId FROM summaries ORDER BY slot, topic_id LIMIT 1")
        .get() as { slot: string; topicId: string };
      c.query("UPDATE summaries SET source_text_read = 0").run();
      c.query("UPDATE summaries SET source_text_read = 1 WHERE slot = ? AND topic_id = ?").run(
        one.slot,
        one.topicId,
      );
      c.close();
      // A blob is there, but its only page is of an echo the step did not offer.
      const blob = join(copy, "blobs", ...enrichKey(one.slot, one.topicId).split("/"));
      mkdirSync(join(blob, ".."), { recursive: true });
      writeFileSync(
        blob,
        JSON.stringify({
          topicId: one.topicId,
          pages: [{ echoId: "not-offered", text: "Synthetic page." }],
        }),
      );
      const lines: string[] = [];
      const out = join(copy, "out");
      const code = await main(
        ["--slot", one.slot, "--data-dir", copy, "--out", out, "--task", "summarize"],
        { out: (l) => lines.push(l), env: {} },
      );
      expect(code).toBe(0);
      expect(lines.at(-1)).toBe(
        "skipped 1 summarize cases whose page text is not stored for their echoes (removed after rawRetentionDays?)",
      );
      expect(loadCases(out).summarize.some((x) => x.id.endsWith(one.topicId))).toBe(false);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  test("a summary written with page text is frozen with the pages enrich gave the model; one whose pages are gone is skipped", async () => {
    const copy = mkdtempSync(join(tmpdir(), "bd-freeze-pages-"));
    try {
      writeFileSync(join(copy, "content.db"), db.serialize());
      const c = new SQLite(join(copy, "content.db"));
      // Two topics this slot summarised. The fixture run read no page, so
      // mark both as written with page text, and store a page for the first
      // only, as the enrich step does (synthetic text, never a real page).
      const summarized = c
        .query(
          `SELECT slot, topic_id AS topicId FROM summaries WHERE slot = (
             SELECT slot FROM summaries GROUP BY slot HAVING count(DISTINCT topic_id) >= 2
             ORDER BY slot LIMIT 1)
           GROUP BY topic_id ORDER BY topic_id LIMIT 2`,
        )
        .all() as { slot: string; topicId: string }[];
      expect(summarized).toHaveLength(2);
      const [read, gone] = summarized as [
        { slot: string; topicId: string },
        { slot: string; topicId: string },
      ];
      c.query("UPDATE summaries SET source_text_read = 0").run();
      c.query(
        "UPDATE summaries SET source_text_read = 1 WHERE slot = ? AND topic_id IN (?, ?)",
      ).run(read.slot, read.topicId, gone.topicId);
      expect(gone.slot).toBe(read.slot);
      const echoIds = (
        c
          .query(
            "SELECT id FROM echoes WHERE topic_id = ? AND first_slot <= ? ORDER BY first_seen_at, id",
          )
          .all(read.topicId, read.slot) as { id: string }[]
      ).map((r) => r.id);
      c.close();
      const pageFor = echoIds[0] ?? "";
      const blob = join(copy, "blobs", ...enrichKey(read.slot, read.topicId).split("/"));
      mkdirSync(join(blob, ".."), { recursive: true });
      writeFileSync(
        blob,
        JSON.stringify({
          topicId: read.topicId,
          pages: [
            { echoId: pageFor, text: "Synthetic page text for the freeze test." },
            // A page of an echo not offered is not in the case (enrich never stores one).
            { echoId: "not-offered", text: "Never frozen." },
          ],
        }),
      );

      const lines: string[] = [];
      const out = join(copy, "out");
      const code = await main(
        ["--slot", read.slot, "--data-dir", copy, "--out", out, "--task", "summarize"],
        { out: (l) => lines.push(l), env: {} },
      );
      expect(code).toBe(0);
      expect(lines.at(-1)).toBe(
        "skipped 1 summarize cases whose page text is not stored for their echoes (removed after rawRetentionDays?)",
      );
      expect(lines.join("\n")).not.toContain("Synthetic page text");
      const cases = loadCases(out).summarize;
      const withPage = cases.find((x) => x.id.endsWith(read.topicId));
      expect(withPage?.input.echoes.map((e) => [e.id, e.page ?? null])).toEqual(
        echoIds.map((id) => [
          id,
          id === pageFor ? "Synthetic page text for the freeze test." : null,
        ]),
      );
      expect(JSON.stringify(cases)).not.toContain("Never frozen.");
      expect(cases.some((x) => x.id.endsWith(gone.topicId))).toBe(false);
      // Every other case was written without page text, and has none.
      for (const x of cases.filter((x) => x !== withPage)) {
        expect(x.input.echoes.every((e) => e.page === undefined)).toBe(true);
      }

      // The eval hands the page to the prompt, apart from the excerpt.
      const seen: unknown[] = [];
      const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
        const input = JSON.parse(JSON.parse(String(init?.body)).messages[0].content);
        seen.push(input);
        return Response.json({
          choices: [{ message: { content: JSON.stringify(fakeSummarize(input)) } }],
        });
      }) as typeof fetch;
      const chain = [{ name: "stand-in", baseUrl: "https://stand-in.test/v1", model: "fake" }];
      await runEval({
        prompts: {
          summarize: {
            version: "summarize-x",
            messages: (input) => [{ role: "user", content: JSON.stringify(input) }],
          },
        },
        cases: { assign: [], summarize: withPage ? [withPage] : [] },
        providers: { assign: [], summarize: chain },
        secret: () => undefined,
        fetch: fetchImpl,
      });
      expect(seen).toEqual([withPage?.input]);
    } finally {
      rmSync(copy, { recursive: true, force: true });
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
        unanswered: {},
      },
      expect.objectContaining({
        contract: { n: cases.summarize.length, of: cases.summarize.length },
        publishable: { n: cases.summarize.length, of: cases.summarize.length },
      }),
    ]);
  });
});
