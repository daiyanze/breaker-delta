import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssignInput,
  type ChatMessage,
  fakeAssign,
  fakeSummarize,
  type Prompts,
  type SummarizeInput,
} from "../packages/judge/src/index.ts";
import {
  type EvalOptions,
  isCommitted,
  MARKER,
  main,
  parseProviders,
  report,
  runEval,
} from "./eval.ts";
import { type AssignCase, CaseError, parseCase, type SummarizeCase } from "./eval-cases.ts";

/**
 * A stand-in prompt, not a real one (#43, #44 add those): the task's name and
 * the input as JSON. The stand-in model below reads it back.
 */
const standIn: Required<Prompts> = {
  assign: {
    version: "stand-in-assign-1",
    messages: (input) => [
      { role: "system", content: "assign" },
      { role: "user", content: JSON.stringify(input) },
    ],
  },
  summarize: {
    version: "stand-in-summarize-1",
    messages: (input) => [
      { role: "system", content: "summarize" },
      { role: "user", content: JSON.stringify(input) },
    ],
  },
};

type Turn = "ok" | "bad" | number | ((input: never) => unknown);

/**
 * A stand-in OpenAI-compatible endpoint per host. Each request takes the next
 * turn of its host's queue: `ok` answers with the deterministic fake
 * (`fakeAssign`, `fakeSummarize`) for the input in the prompt, `bad` with
 * JSON that fails the contract, a number with that HTTP status, a function
 * with what it returns for the input.
 */
function standInModel(queues: Record<string, Turn[]>) {
  const keys: (string | null)[] = [];
  const impl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    keys.push(new Headers(init?.headers).get("authorization"));
    const { messages } = JSON.parse(String(init?.body)) as { messages: ChatMessage[] };
    const task = messages[0]?.content;
    const input = JSON.parse(messages[1]?.content ?? "null");
    const turn = queues[new URL(String(url)).host]?.shift() ?? "ok";
    if (typeof turn === "number") return new Response("no", { status: turn });
    const answer =
      turn === "bad"
        ? { nope: true }
        : typeof turn === "function"
          ? turn(input as never)
          : task === "assign"
            ? fakeAssign(input as AssignInput)
            : fakeSummarize(input as SummarizeInput);
    return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
  };
  return { fetch: impl as typeof fetch, keys };
}

const KEY = "sk-test-not-a-real-key";
const providers: EvalOptions["providers"] = {
  assign: [
    { name: "a", baseUrl: "https://a.test/v1", model: "m-a", apiKeyRef: "A_KEY" },
    { name: "b", baseUrl: "https://b.test/v1", model: "m-b" },
  ],
  summarize: [{ name: "a", baseUrl: "https://a.test/v1", model: "m-a", apiKeyRef: "A_KEY" }],
};
const secret = (name: string) => (name === "A_KEY" ? KEY : undefined);

const assignCase = (id: string, labels?: Record<string, string>): AssignCase => ({
  id,
  input: {
    echoes: [
      { id: `${id}-e1`, title: "CASE-TEXT OpenAI releases GPT-6 model" },
      { id: `${id}-e2`, title: "CASE-TEXT Rust compiler announced" },
    ],
    topics: [{ id: "t1", name: "OpenAI GPT-6 launch" }],
  },
  ...(labels ? { labels } : {}),
});

const summarizeCase = (id: string, first = true): SummarizeCase => ({
  id,
  input: {
    name: "OpenAI GPT-6 launch",
    echoes: [
      { id: "e1", title: "CASE-TEXT OpenAI releases GPT-6", summary: "CASE-TEXT excerpt" },
      { id: "e2", title: "CASE-TEXT GPT-6 is out" },
    ],
    languages: ["en", "zh", "ja"],
    first,
  },
});

describe("runEval", () => {
  test("scores assign through the chain: contract, citations, repair and fallback", async () => {
    // c1: a answers. c2: a's first answer fails the contract, the repair passes.
    // c3: a is down, b answers.
    const model = standInModel({ "a.test": ["ok", "bad", "ok", 500], "b.test": ["ok"] });
    const [assign, summarize] = await runEval({
      prompts: { assign: standIn.assign },
      cases: { assign: [assignCase("c1"), assignCase("c2"), assignCase("c3")], summarize: [] },
      providers,
      secret,
      fetch: model.fetch,
    });
    expect(summarize).toEqual({ task: "summarize", status: "no-prompt" });
    expect(assign).toEqual({
      task: "assign",
      status: "ran",
      prompt: "stand-in-assign-1",
      cases: 3,
      providers: [
        { name: "a", model: "m-a" },
        { name: "b", model: "m-b" },
      ],
      metrics: {
        contract: { n: 3, of: 3 },
        citations: { n: 6, of: 6 },
        repaired: { n: 1, of: 3 },
        fallback: { n: 1, of: 3 },
      },
    });
    expect(model.keys).toEqual([
      `Bearer ${KEY}`,
      `Bearer ${KEY}`,
      `Bearer ${KEY}`,
      `Bearer ${KEY}`,
      null,
    ]);
  });

  test("an assignment the pipeline would reject is not a valid citation; a dead chain is a contract miss", async () => {
    const offList = (input: AssignInput) => ({
      assignments: [
        { echoId: input.echoes[0]?.id, topicId: "t-not-shortlisted" },
        { echoId: input.echoes[1]?.id, newTopic: { name: "see https://example.com" } },
      ],
    });
    const model = standInModel({ "a.test": [offList, 500], "b.test": [500] });
    const [assign] = await runEval({
      prompts: { assign: standIn.assign },
      cases: { assign: [assignCase("c1"), assignCase("c2")], summarize: [] },
      providers,
      secret,
      fetch: model.fetch,
    });
    expect(assign?.status === "ran" && assign.metrics).toMatchObject({
      contract: { n: 1, of: 2 },
      citations: { n: 0, of: 4 },
      repaired: { n: 0, of: 1 },
    });
  });

  test("agreement counts labelled echoes placed as the owner labelled them", async () => {
    // The fake places e1 in t1 (shared words) and e2 in a new topic.
    const [assign] = await runEval({
      prompts: { assign: standIn.assign },
      cases: {
        assign: [
          assignCase("c1", { "c1-e1": "t1", "c1-e2": "new" }),
          assignCase("c2", { "c2-e1": "new" }),
          assignCase("c3"),
        ],
        summarize: [],
      },
      providers,
      secret,
      fetch: standInModel({}).fetch,
    });
    expect(assign?.status === "ran" && assign.metrics.agreement).toEqual({ n: 2, of: 3 });
  });

  test("scores summarize: citations, languages and the validate step's verdict", async () => {
    const english = (input: SummarizeInput) => ({
      ...fakeSummarize(input),
      texts: fakeSummarize(input).texts.slice(0, 1),
    });
    const unknownId = (input: SummarizeInput) => ({
      ...fakeSummarize(input),
      evidenceEchoIds: ["e-not-offered"],
    });
    const noCriterion = (input: SummarizeInput) => {
      const { criterion: _, ...rest } = fakeSummarize(input);
      return rest;
    };
    const model = standInModel({ "a.test": ["ok", english, unknownId, noCriterion, "ok"] });
    const [, summarize] = await runEval({
      prompts: { summarize: standIn.summarize },
      cases: {
        assign: [],
        summarize: ["s1", "s2", "s3", "s4"]
          .map((id) => summarizeCase(id))
          .concat(summarizeCase("s5", false)),
      },
      providers,
      secret,
      fetch: model.fetch,
    });
    expect(summarize?.status === "ran" && summarize.metrics).toEqual({
      contract: { n: 5, of: 5 },
      citations: { n: 4, of: 5 },
      languages: { n: 4, of: 5 },
      publishable: { n: 2, of: 5 },
      repaired: { n: 0, of: 5 },
      fallback: { n: 0, of: 5 },
    });
  });

  test("a prompt with no cases, or with no provider key, is not evaluated", async () => {
    const tasks = await runEval({
      prompts: standIn,
      cases: { assign: [], summarize: [summarizeCase("s1")] },
      providers,
      secret: () => undefined,
      fetch: standInModel({}).fetch,
    });
    expect(tasks).toEqual([
      { task: "assign", status: "no-cases", prompt: "stand-in-assign-1" },
      {
        task: "summarize",
        status: "no-provider",
        prompt: "stand-in-summarize-1",
        cases: 1,
        keys: ["A_KEY"],
      },
    ]);
    expect(report({ tasks })).toContain("set `A_KEY`");
  });
});

describe("report", () => {
  test("holds numbers, versions and provider names, never answers, case text or keys", async () => {
    const leaky = (input: AssignInput) => ({
      assignments: input.echoes.map((e) => ({ echoId: e.id, newTopic: { name: "LEAK-MARKER" } })),
    });
    const tasks = await runEval({
      prompts: standIn,
      cases: { assign: [assignCase("c1")], summarize: [summarizeCase("s1")] },
      providers,
      secret,
      fetch: standInModel({ "a.test": [leaky, "bad", "bad"] }).fetch,
    });
    const md = report({ sha: "0123456789abcdef", tasks });
    expect(md.startsWith(`${MARKER}\n### Eval for 0123456\n`)).toBe(true);
    expect(md).toContain("| assign | `stand-in-assign-1` | 1 | 1/1 (100%) | 2/2 (100%) |");
    expect(md).toContain("| summarize | `stand-in-summarize-1` | 1 | 0/1 (0%) | 0/0 |");
    expect(md).toContain("- assign chain: a `m-a`, b `m-b`");
    for (const text of [md, JSON.stringify(tasks)]) {
      expect(text).not.toContain("LEAK-MARKER");
      expect(text).not.toContain("CASE-TEXT");
      expect(text).not.toContain(KEY);
      expect(text).not.toContain("invalid");
    }
  });
});

describe("main", () => {
  function workspace() {
    const dir = mkdtempSync(join(tmpdir(), "bd-eval-"));
    const cases = join(dir, "cases");
    mkdirSync(join(cases, "assign"), { recursive: true });
    const { id, ...body } = assignCase("c1");
    writeFileSync(
      join(cases, "assign", `${id}.json`),
      JSON.stringify({ synthetic: true, ...body }),
    );
    writeFileSync(
      join(dir, "providers.json"),
      JSON.stringify({ assign: providers.assign.slice(0, 1) }),
    );
    const lines: string[] = [];
    const args = (...more: string[]) => [
      "--cases",
      cases,
      "--providers",
      join(dir, "providers.json"),
      ...more,
    ];
    return { dir, cases, lines, args, out: (l: string) => lines.push(l) };
  }

  test("evaluates the cases on disk and writes the report and the JSON", async () => {
    const w = workspace();
    const code = await main(
      w.args(
        "--report",
        join(w.dir, "r.md"),
        "--json",
        join(w.dir, "r.json"),
        "--sha",
        "abcdef1234",
      ),
      {
        out: w.out,
        env: { A_KEY: KEY },
        fetch: standInModel({}).fetch,
        prompts: { assign: standIn.assign },
      },
    );
    expect(code).toBe(0);
    const md = readFileSync(join(w.dir, "r.md"), "utf8");
    expect(md).toContain("### Eval for abcdef1");
    expect(md).toContain("| assign | `stand-in-assign-1` | 1 | 1/1 (100%) |");
    expect(JSON.parse(readFileSync(join(w.dir, "r.json"), "utf8")).tasks[0].status).toBe("ran");
    expect(w.lines.join("\n")).toBe(md.trimEnd());
  });

  test("exits 1 when a shipped prompt could not be evaluated, 0 when none ships", async () => {
    const w = workspace();
    const io = { out: w.out, env: {}, fetch: standInModel({}).fetch };
    expect(await main(w.args(), { ...io, prompts: { assign: standIn.assign } })).toBe(1);
    expect(await main(w.args(), { ...io, prompts: { summarize: standIn.summarize } })).toBe(1);
    expect(await main(w.args(), { ...io, prompts: {} })).toBe(0);
  });

  test("exits 2 on a case that does not fit the format, naming the file and path only", async () => {
    const w = workspace();
    writeFileSync(
      join(w.cases, "assign", "bad.json"),
      JSON.stringify({
        synthetic: true,
        input: { echoes: [{ id: "e1", title: "CASE-TEXT", url: "https://x.test/a" }], topics: [] },
      }),
    );
    const code = await main(w.args(), { out: w.out, env: {}, prompts: {} });
    expect(code).toBe(2);
    expect(w.lines).toEqual([
      `${join("assign", "bad.json")}: input.echoes.0.url: is not part of the case format`,
    ]);
  });

  test("the shipped cases and providers file read", async () => {
    const lines: string[] = [];
    // Cases from the repository; a prompt-less run makes no call.
    expect(await main([], { out: (l) => lines.push(l), env: {} })).toBe(0);
  });
});

describe("parseCase", () => {
  const ok = {
    synthetic: true as const,
    input: { echoes: [{ id: "e1", title: "x" }], topics: [{ id: "t1", name: "y" }] },
  };

  test("reads an assign case with labels", () => {
    expect(parseCase("assign", "c1", { ...ok, labels: { e1: "t1" } })).toEqual({
      id: "c1",
      ...ok,
      labels: { e1: "t1" },
    });
    expect(
      parseCase("assign", "c1", { frozenFrom: "s", input: ok.input, labels: { e1: "new" } }),
    ).toEqual({ id: "c1", frozenFrom: "s", input: ok.input, labels: { e1: "new" } });
  });

  const refused: [string, "assign" | "summarize", unknown, string][] = [
    ["a key the format does not name", "assign", { ...ok, note: "x" }, "note: is not part of"],
    [
      "a URL on an echo",
      "assign",
      { synthetic: true, input: { echoes: [{ id: "e1", title: "x", url: "u" }], topics: [] } },
      "input.echoes.0.url",
    ],
    [
      "a source on a topic",
      "assign",
      {
        synthetic: true,
        input: {
          echoes: [{ id: "e1", title: "x" }],
          topics: [{ id: "t", name: "n", source: "s" }],
        },
      },
      "input.topics.0.source",
    ],
    [
      "no echoes",
      "assign",
      { synthetic: true, input: { echoes: [], topics: [] } },
      "at least one echo",
    ],
    [
      "an echo twice",
      "assign",
      {
        synthetic: true,
        input: {
          echoes: [
            { id: "e1", title: "x" },
            { id: "e1", title: "y" },
          ],
          topics: [],
        },
      },
      "appears twice",
    ],
    ["a label for a topic not shortlisted", "assign", { ...ok, labels: { e1: "t9" } }, "labels.e1"],
    [
      "a label for an echo not in the case",
      "assign",
      { ...ok, labels: { e9: "new" } },
      "labels.e9",
    ],
    ["labels on summarize", "summarize", { synthetic: true, labels: {} }, "only assign"],
    [
      "a language not enabled",
      "summarize",
      {
        synthetic: true,
        input: { name: "n", echoes: [{ id: "e1", title: "x" }], languages: ["fr"], first: true },
      },
      "input.languages.0",
    ],
    [
      "first missing",
      "summarize",
      {
        synthetic: true,
        input: { name: "n", echoes: [{ id: "e1", title: "x" }], languages: ["en"] },
      },
      "input.first",
    ],
    [
      "a blank title",
      "assign",
      { synthetic: true, input: { echoes: [{ id: "e1", title: " " }], topics: [] } },
      "title",
    ],
  ];
  for (const [what, task, json, message] of refused) {
    test(`refuses ${what}`, () => {
      expect(() => parseCase(task, "c1", json)).toThrow(CaseError);
      expect(() => parseCase(task, "c1", json)).toThrow(message);
    });
  }

  test("refuses an id that is not a plain file name", () => {
    expect(() => parseCase("assign", "../x", ok)).toThrow(CaseError);
  });
});

describe("parseProviders", () => {
  test("reads the chains and refuses a key written into the file", () => {
    expect(parseProviders({ assign: providers.assign })).toEqual({
      assign: providers.assign,
      summarize: [],
    });
    expect(() =>
      parseProviders({
        assign: [{ name: "a", baseUrl: "https://a.test", model: "m", apiKey: "sk" }],
      }),
    ).toThrow("assign.0 is not a provider");
    expect(() => parseProviders({ classify: [] })).toThrow("classify is not a task");
  });

  test("the shipped file reads, and names its keys by reference only", () => {
    const file = parseProviders(JSON.parse(readFileSync("evals/providers.json", "utf8")));
    for (const p of [...file.assign, ...file.summarize]) expect(p.apiKeyRef).toMatch(/^[A-Z_]+$/);
  });
});

describe("isCommitted", () => {
  test("is the repository's evals/cases folder, however it is named", () => {
    expect(isCommitted("evals/cases")).toBe(true);
    expect(isCommitted(join(import.meta.dir, "..", "evals", "cases", "."))).toBe(true);
    expect(isCommitted(".bd-data/eval-cases")).toBe(false);
  });
});

describe("the defaults", () => {
  test("read the committed cases and providers file from any working directory", async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), "bd-eval-cwd-"));
    const before = process.cwd();
    const lines: string[] = [];
    try {
      process.chdir(elsewhere);
      // Files at the relative paths, which a cwd-relative default would read.
      mkdirSync(join(elsewhere, "evals", "cases", "assign"), { recursive: true });
      writeFileSync(join(elsewhere, "evals", "cases", "assign", "bad.json"), "not json");
      writeFileSync(join(elsewhere, "evals", "providers.json"), "not json");
      expect(await main([], { out: (l) => lines.push(l), env: {}, prompts: {} })).toBe(0);
    } finally {
      process.chdir(before);
    }
  });
});
