import { describe, expect, test } from "bun:test";
import { AssignResultSchema, SummarizeResultSchema } from "@bd/contracts";
import {
  type AssignInput,
  FAKE_MODEL,
  FAKE_PROVIDER,
  fakeAssign,
  fakeDriver,
  fakeSummarize,
  type ModelDriver,
  type SummarizeInput,
  words,
} from "./index.ts";

const assignInput: AssignInput = {
  echoes: [
    { id: "e1", title: "OpenAI releases GPT-6 with longer context" },
    { id: "e2", title: "Rust 2.0 compiler announced" },
    { id: "e3", title: "Rust compiler 2.0: what changes" },
    { id: "e4", title: "Weather is nice" },
    { id: "e5", title: "GPT-6 リリース、OpenAI が発表" },
  ],
  topics: [
    { id: "t1", name: "OpenAI GPT-6 launch" },
    { id: "t2", name: "Quantum chips", aliases: ["quantum computing chips"] },
  ],
};

const summarizeInput: SummarizeInput = {
  name: "OpenAI GPT-6 launch",
  echoes: [
    { id: "e1", title: "OpenAI releases GPT-6" },
    { id: "e5", title: "GPT-6 リリース" },
  ],
  languages: ["en", "zh", "ja"],
  first: true,
};

describe("fakeAssign", () => {
  test("same input gives same output", () => {
    expect(fakeAssign(assignInput)).toEqual(fakeAssign(structuredClone(assignInput)));
  });

  test("output passes the assign contract, one assignment per echo in order", () => {
    const r = fakeAssign(assignInput);
    expect(AssignResultSchema.safeParse(r).success).toBe(true);
    expect(r.assignments.map((a) => a.echoId)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
  });

  test("matches shortlisted topics by shared words, and only those", () => {
    const r = fakeAssign(assignInput);
    expect(r.assignments[0]).toEqual({ echoId: "e1", topicId: "t1" });
    expect(r.assignments[4]).toEqual({ echoId: "e5", topicId: "t1" });
    const ids = new Set(assignInput.topics.map((t) => t.id));
    for (const a of r.assignments) if ("topicId" in a) expect(ids.has(a.topicId)).toBe(true);
  });

  test("matches an alias", () => {
    const r = fakeAssign({
      echoes: [{ id: "e1", title: "New quantum computing record" }],
      topics: [{ id: "t2", name: "Qubits", aliases: ["quantum computing chips"] }],
    });
    expect(r.assignments).toEqual([{ echoId: "e1", topicId: "t2" }]);
  });

  test("similar new echoes propose one new topic; unrelated ones their own", () => {
    const r = fakeAssign(assignInput);
    expect(r.assignments[1]).toEqual({
      echoId: "e2",
      newTopic: { name: "Rust 2.0 compiler announced" },
    });
    expect(r.assignments[2]).toEqual({
      echoId: "e3",
      newTopic: { name: "Rust 2.0 compiler announced" },
    });
    expect(r.assignments[3]).toEqual({ echoId: "e4", newTopic: { name: "Weather is nice" } });
  });

  test("one shared word or stopwords alone are not a match", () => {
    const r = fakeAssign({
      echoes: [{ id: "e1", title: "The state of the chips and the market" }],
      topics: [{ id: "t1", name: "The chips and the rest" }],
    });
    expect(r.assignments[0]).toHaveProperty("newTopic");
  });

  test("ties go to the earlier topic", () => {
    const r = fakeAssign({
      echoes: [{ id: "e1", title: "alpha beta gamma" }],
      topics: [
        { id: "t1", name: "alpha beta" },
        { id: "t2", name: "beta gamma" },
      ],
    });
    expect(r.assignments[0]).toEqual({ echoId: "e1", topicId: "t1" });
  });

  test("a new topic name fits the contract for long or empty titles", () => {
    const long = `${"😀".repeat(70)} tail`;
    const r = fakeAssign({
      echoes: [
        { id: "e1", title: long },
        { id: "e2", title: "   " },
      ],
      topics: [],
    });
    expect(AssignResultSchema.safeParse(r).success).toBe(true);
    const [a, b] = r.assignments;
    expect(a && "newTopic" in a && a.newTopic.name).toBe("😀".repeat(60));
    expect(b && "newTopic" in b && b.newTopic.name).toBe("e2");
  });

  test("no echoes gives no assignments", () => {
    expect(fakeAssign({ echoes: [], topics: assignInput.topics })).toEqual({ assignments: [] });
  });
});

describe("fakeSummarize", () => {
  test("same input gives same output", () => {
    expect(fakeSummarize(summarizeInput)).toEqual(fakeSummarize(structuredClone(summarizeInput)));
  });

  test("output passes the summarize contract", () => {
    const r = fakeSummarize(summarizeInput);
    expect(SummarizeResultSchema.safeParse(r).success).toBe(true);
    expect(r.texts.map((t) => t.lang)).toEqual(["en", "zh", "ja"]);
    expect(r.riskFlags).toEqual([]);
  });

  test("cites the given echoes by id only, once each", () => {
    const r = fakeSummarize({
      ...summarizeInput,
      echoes: [...summarizeInput.echoes, { id: "e1", title: "again" }],
    });
    expect(r.evidenceEchoIds).toEqual(["e1", "e5"]);
    for (const t of r.texts) expect(t.body).not.toContain("http");
  });

  test("marks every text as fake", () => {
    const r = fakeSummarize(summarizeInput);
    for (const t of r.texts) expect(t.body).toMatch(/^\[(fake|模拟|模擬)\]/);
    expect(r.criterion).toStartWith("[fake]");
  });

  test("a criterion only on the first summary", () => {
    expect(fakeSummarize({ ...summarizeInput, first: false })).not.toHaveProperty("criterion");
  });

  test("long names are clipped to the contract", () => {
    const r = fakeSummarize({ ...summarizeInput, name: "x".repeat(2000) });
    expect(SummarizeResultSchema.safeParse(r).success).toBe(true);
  });

  test("no echoes to cite is an error, not an invalid result", () => {
    expect(() => fakeSummarize({ ...summarizeInput, echoes: [] })).toThrow(/no echoes/);
  });
});

describe("fakeDriver", () => {
  test("is a ModelDriver that names the fake provider", async () => {
    const driver: ModelDriver = fakeDriver();
    const a = await driver.assign(assignInput);
    expect(a).toEqual({
      value: fakeAssign(assignInput),
      provider: FAKE_PROVIDER,
      model: FAKE_MODEL,
      repaired: false,
    });
    const s = await driver.summarize(summarizeInput);
    expect(s.value).toEqual(fakeSummarize(summarizeInput));
    expect(s.provider).toBe(FAKE_PROVIDER);
  });
});

describe("words", () => {
  test("drops stopwords and single letters; pairs CJK characters", () => {
    expect([...words("The GPT-6 and a model")]).toEqual(["gpt", "model"]);
    expect([...words("発表した")]).toEqual(["発表", "表し", "した"]);
  });
});
