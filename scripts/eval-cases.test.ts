import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CaseError, COMMITTED_CASES, loadCases, parseCase } from "./eval-cases.ts";

/**
 * Committed cases are synthetic only (owner, #253 review round 1): cases
 * frozen from a real run hold fetched text, which must never reach a
 * session that can write code (invariant 6), and a review reads the diff.
 */

const input = { echoes: [{ id: "e1", title: "Rust 2.0 compiler" }], topics: [] };

function dir(files: Record<string, unknown>): string {
  const d = mkdtempSync(join(tmpdir(), "bd-cases-"));
  for (const [path, json] of Object.entries(files)) {
    mkdirSync(dirname(join(d, path)), { recursive: true });
    writeFileSync(join(d, path), JSON.stringify(json));
  }
  return d;
}

describe("the committed cases", () => {
  test("are all synthetic, and pass the value check", () => {
    // Throws on any case in evals/cases/ that is frozen from a run, unmarked,
    // or holds a URL, an email or a key-shaped string.
    expect(() => loadCases(COMMITTED_CASES, { committed: true })).not.toThrow();
  });
});

describe("a case's origin", () => {
  test("is synthetic or frozen from a slot, exactly one", () => {
    expect(parseCase("assign", "c1", { synthetic: true, input }).synthetic).toBe(true);
    expect(parseCase("assign", "c1", { frozenFrom: "20261120T0500", input }).frozenFrom).toBe(
      "20261120T0500",
    );
    expect(() => parseCase("assign", "c1", { input })).toThrow("synthetic: true or frozenFrom");
    expect(() => parseCase("assign", "c1", { synthetic: true, frozenFrom: "s", input })).toThrow(
      "synthetic: true or frozenFrom",
    );
    expect(() => parseCase("assign", "c1", { synthetic: "yes", input })).toThrow(
      "synthetic: true or frozenFrom",
    );
  });

  test("a frozen case is refused where cases are committed, and read from a local folder", () => {
    const d = dir({ "assign/real.json": { frozenFrom: "20261120T0500", input } });
    expect(() => loadCases(d, { committed: true })).toThrow(CaseError);
    expect(() => loadCases(d, { committed: true })).toThrow(
      "assign/real.json: frozenFrom: a case frozen from a run is never committed",
    );
    expect(loadCases(d).assign.map((c) => c.id)).toEqual(["real"]);
  });
});

describe("the committed folder holds only cases", () => {
  const valid = { synthetic: true, input };
  const strays: [string, string][] = [
    ["a case in a subfolder", "assign/sub/x.json"],
    ["an upper-case extension", "assign/y.JSON"],
    ["a file at the top", "notes.json"],
    ["a folder that is not a task", "frozen/s1-01.json"],
    ["a copied local folder", "eval-cases/assign/s1-01.json"],
    ["a non-JSON file", "assign/README.md"],
    ["a hidden file", "assign/.gitkeep"],
    ["a file with no extension", "summarize/case"],
  ];
  for (const [what, path] of strays) {
    test(`refuses ${what}`, () => {
      const d = dir({ "assign/ok.json": valid, [path]: valid });
      expect(() => loadCases(d, { committed: true })).toThrow(CaseError);
      expect(() => loadCases(d, { committed: true })).toThrow(`${path}: (root): is not a case`);
      // A local folder is read as before: only <task>/<id>.json.
      expect(loadCases(d).assign.map((c) => c.id)).toEqual(["ok"]);
    });
  }

  test("reads a folder of valid synthetic cases", () => {
    const d = dir({
      "assign/a.json": valid,
      "summarize/s.json": {
        synthetic: true,
        input: { name: "n", echoes: [{ id: "e1", title: "x" }], languages: ["en"], first: false },
      },
    });
    const cases = loadCases(d, { committed: true });
    expect(cases.assign.map((c) => c.id)).toEqual(["a"]);
    expect(cases.summarize.map((c) => c.id)).toEqual(["s"]);
  });
});

describe("the value check on synthetic cases", () => {
  const planted: [string, string][] = [
    ["a URL", "see https://example.com/a"],
    ["a URL without a scheme", "at www.example.com"],
    ["an email", "mail someone@example.com"],
    ["an OpenAI-style key", "sk-test0000000000000000"],
    ["a Groq key", "gsk_0000000000000000abcd"],
    ["a Google key", "AIzaSyA0000000000000000000000000000000"],
    ["a GitHub token", "ghp_000000000000000000000000000000000000"],
    ["a Cloudflare token", "cfat_0000000000000000"],
    ["a bearer header", "Bearer abcdefghijklmnop"],
    ["a JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0"],
  ];
  const places: [string, (v: string) => unknown][] = [
    [
      "an echo title",
      (v) => ({ synthetic: true, input: { echoes: [{ id: "e1", title: v }], topics: [] } }),
    ],
    [
      "an echo summary",
      (v) => ({
        synthetic: true,
        input: { echoes: [{ id: "e1", title: "x", summary: v }], topics: [] },
      }),
    ],
    [
      "a topic alias",
      (v) => ({
        synthetic: true,
        input: {
          echoes: [{ id: "e1", title: "x" }],
          topics: [{ id: "t1", name: "y", aliases: [v] }],
        },
      }),
    ],
  ];
  for (const [what, value] of planted) {
    for (const [where, make] of places) {
      test(`refuses ${what} in ${where}`, () => {
        expect(() => parseCase("assign", "c1", make(value))).toThrow(
          "looks like a URL, an email or a key",
        );
      });
    }
  }

  test("refuses one in a summarize name, and names the path, not the value", () => {
    const json = {
      synthetic: true,
      input: {
        name: "x https://a.test",
        echoes: [{ id: "e1", title: "x" }],
        languages: ["en"],
        first: true,
      },
    };
    let message = "";
    try {
      parseCase("summarize", "s1", json);
    } catch (err) {
      message = String(err);
    }
    expect(message).toContain("input.name");
    expect(message).not.toContain("a.test");
  });

  test("passes ordinary titles, versions, CJK text and dotted names", () => {
    for (const title of [
      "Rust 2.0 compiler announced",
      "OpenAI GPT-5.5 / 5.9 release notes",
      "GPT-6 リリース、OpenAI が発表",
      "U.S. chip rules",
      "ASP.NET 10 preview",
      "task-skill rename",
    ]) {
      expect(() =>
        parseCase("assign", "c1", {
          synthetic: true,
          input: { echoes: [{ id: "e1", title }], topics: [] },
        }),
      ).not.toThrow();
    }
  });

  test("a frozen case is not value-checked: real titles hold URLs, and it stays local", () => {
    expect(() =>
      parseCase("assign", "c1", {
        frozenFrom: "s",
        input: { echoes: [{ id: "e1", title: "see https://example.com" }], topics: [] },
      }),
    ).not.toThrow();
  });
});
