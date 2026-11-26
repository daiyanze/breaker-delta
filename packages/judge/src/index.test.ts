import { describe, expect, test } from "bun:test";
import {
  ChainExhaustedError,
  callChain,
  callsOf,
  chainDriver,
  type DriverPrompts,
  type ModelCall,
  parseJson,
  type ResolvedProvider,
  readUsage,
  type Validate,
} from "./index.ts";

const A: ResolvedProvider = { name: "a", baseUrl: "https://a.test/v1/", model: "m-a", apiKey: "k" };
const B: ResolvedProvider = { name: "b", baseUrl: "https://b.test/v1", model: "m-b" };

const validate: Validate<{ n: number }> = (raw) => {
  const n = (raw as { n?: unknown } | undefined)?.n;
  return typeof n === "number"
    ? { ok: true, value: { n } }
    : { ok: false, error: "n must be a number" };
};

/**
 * Fake fetch: answers per host from a queue; a number means an HTTP status,
 * an object a completion with that `usage`.
 */
function fakeFetch(
  script: Record<string, (string | number | { content: string; usage: unknown })[]>,
) {
  const calls: { url: string; auth: string | null; messages: number }[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as { messages: unknown[] };
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get("authorization"), messages: body.messages.length });
    const next = script[new URL(url).host]?.shift();
    if (typeof next === "number") return new Response("nope", { status: next });
    if (typeof next === "object") {
      return Response.json({
        choices: [{ message: { content: next.content } }],
        usage: next.usage,
      });
    }
    return Response.json({ choices: [{ message: { content: next ?? "" } }] });
  };
  return { fetch: impl as typeof fetch, calls };
}

const messages = [{ role: "user" as const, content: "go" }];

describe("callChain", () => {
  test("returns the first valid answer and sends the key", async () => {
    const f = fakeFetch({ "a.test": ['{"n":1}'] });
    const r = await callChain([A, B], messages, validate, { fetch: f.fetch });
    expect(r).toEqual({
      value: { n: 1 },
      provider: "a",
      model: "m-a",
      promptVersion: null,
      repaired: false,
      calls: [
        {
          provider: "a",
          model: "m-a",
          promptVersion: null,
          outcome: "ok",
          fallback: false,
          usage: {},
        },
      ],
    });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.url).toBe("https://a.test/v1/chat/completions");
    expect(f.calls[0]?.auth).toBe("Bearer k");
  });

  test("repairs once with the validation error", async () => {
    const f = fakeFetch({ "a.test": ['{"n":"x"}', '```json\n{"n":2}\n```'] });
    const r = await callChain([A, B], messages, validate, { fetch: f.fetch });
    expect(r.value).toEqual({ n: 2 });
    expect(r.repaired).toBe(true);
    expect(f.calls[1]?.messages).toBe(3);
  });

  test("moves to the next provider on HTTP error, without a key when none is set", async () => {
    const f = fakeFetch({ "a.test": [429], "b.test": ['{"n":3}'] });
    const r = await callChain([A, B], messages, validate, { fetch: f.fetch });
    expect(r.provider).toBe("b");
    expect(f.calls[1]?.auth).toBeNull();
  });

  test("moves on after a failed repair", async () => {
    const f = fakeFetch({ "a.test": ["nonsense", "still nonsense"], "b.test": ['{"n":4}'] });
    const r = await callChain([A, B], messages, validate, { fetch: f.fetch });
    expect(r.provider).toBe("b");
    expect(f.calls).toHaveLength(3);
  });

  test("throws with every attempt when the chain is exhausted", async () => {
    const f = fakeFetch({ "a.test": [500], "b.test": ["{}", "{}"] });
    const err = await callChain([A, B], messages, validate, { fetch: f.fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(ChainExhaustedError);
    expect((err as ChainExhaustedError).attempts.map((a) => a.provider)).toEqual(["a", "b"]);
  });

  test("an empty chain fails", async () => {
    await expect(callChain([], messages, validate)).rejects.toBeInstanceOf(ChainExhaustedError);
  });
});

describe("callChain records its calls (#48)", () => {
  const brief = (c: ModelCall) => [c.provider, c.outcome, c.fallback];

  test("each call, in order, with its outcome and whether the chain had fallen back", async () => {
    const f = fakeFetch({ "a.test": [429], "b.test": ["nonsense", '{"n":5}'] });
    const r = await callChain([A, B], messages, validate, { fetch: f.fetch });
    expect(r.calls.map(brief)).toEqual([
      ["a", "error", false],
      ["b", "invalid", true],
      ["b", "ok", true],
    ]);
    expect(r.calls.map((c) => c.model)).toEqual(["m-a", "m-b", "m-b"]);
  });

  test("a repair on the first provider is not a fallback", async () => {
    const f = fakeFetch({ "a.test": ['{"n":"x"}', '{"n":2}'] });
    const r = await callChain([A, B], messages, validate, { fetch: f.fetch });
    expect(r.calls.map(brief)).toEqual([
      ["a", "invalid", false],
      ["a", "ok", false],
    ]);
  });

  test("an exhausted chain carries every call it made", async () => {
    const f = fakeFetch({ "a.test": [500], "b.test": ["{}", "{}"] });
    const err = await callChain([A, B], messages, validate, { fetch: f.fetch }).catch((e) => e);
    expect(callsOf(err).map(brief)).toEqual([
      ["a", "error", false],
      ["b", "invalid", true],
      ["b", "invalid", true],
    ]);
  });

  test("callsOf any other error is empty", () => {
    expect(callsOf(new Error("no model"))).toEqual([]);
    expect(callsOf("x")).toEqual([]);
  });

  test("token counts come from the response's usage, when it has them", async () => {
    const f = fakeFetch({
      "a.test": [
        { content: '{"n":"x"}', usage: { prompt_tokens: 10, completion_tokens: 3 } },
        {
          content: '{"n":1}',
          usage: { prompt_tokens: 14, completion_tokens: 2, total_tokens: 16 },
        },
      ],
    });
    const r = await callChain([A], messages, validate, { fetch: f.fetch });
    expect(r.calls.map((c) => c.usage)).toEqual([
      { promptTokens: 10, completionTokens: 3 },
      { promptTokens: 14, completionTokens: 2, totalTokens: 16 },
    ]);
  });

  test("the prompt version is on the result and each call", async () => {
    const f = fakeFetch({ "a.test": [500], "b.test": ['{"n":1}'] });
    const r = await callChain([A, B], messages, validate, {
      fetch: f.fetch,
      promptVersion: "v3",
    });
    expect(r.promptVersion).toBe("v3");
    expect(r.calls.map((c) => c.promptVersion)).toEqual(["v3", "v3"]);
  });

  test("no call record holds the key", async () => {
    const key = "sk-test-not-a-real-key";
    const f = fakeFetch({ "a.test": [401, '{"n":1}'] });
    const err = await callChain([{ ...A, apiKey: key }], messages, validate, {
      fetch: f.fetch,
    }).catch((e) => e);
    expect(JSON.stringify(callsOf(err))).not.toContain(key);
  });
});

describe("readUsage", () => {
  test("keeps whole non-negative counts and drops the rest", () => {
    expect(readUsage({ prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 })).toEqual({
      promptTokens: 5,
      completionTokens: 2,
      totalTokens: 7,
    });
    expect(readUsage({ prompt_tokens: -1, completion_tokens: 1.5, total_tokens: "7" })).toEqual({});
    expect(readUsage(undefined)).toEqual({});
    expect(readUsage(null)).toEqual({});
    expect(readUsage("x")).toEqual({});
  });
});

describe("parseJson", () => {
  test("handles bare, fenced and invalid text", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('text\n```\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJson("not json")).toBeUndefined();
  });
});

describe("chainDriver", () => {
  const input = { echoes: [{ id: "e1", title: "Rocket ships" }], topics: [] };
  /** Test prompts: the input as JSON. Not a real prompt (#43, #44). */
  const prompts: DriverPrompts = {
    assign: (i) => [{ role: "user", content: JSON.stringify(i) }],
    summarize: (i) => [{ role: "user", content: JSON.stringify(i) }],
  };

  test("asks the chain and returns an answer that passes the assign contract", async () => {
    const answer = { assignments: [{ echoId: "e1", newTopic: { name: "Rocket" } }] };
    const f = fakeFetch({ "a.test": [JSON.stringify(answer)] });
    const r = await chainDriver([A], prompts, { fetch: f.fetch }).assign(input);
    expect(r.value).toEqual(answer);
    expect([r.provider, r.model, r.repaired, r.promptVersion]).toEqual(["a", "m-a", false, null]);
    expect(f.calls[0]?.auth).toBe("Bearer k");
  });

  test("an answer the contract refuses is repaired once, then the next provider is asked", async () => {
    const answer = { assignments: [{ echoId: "e1", topicId: "t1" }] };
    const f = fakeFetch({
      "a.test": ['{"assignments":"x"}', "{}"],
      "b.test": [JSON.stringify(answer)],
    });
    const r = await chainDriver([A, B], prompts, { fetch: f.fetch }).assign(input);
    expect(r.provider).toBe("b");
    expect(f.calls).toHaveLength(3);
  });

  test("summarize checks the summarize contract", async () => {
    const f = fakeFetch({ "a.test": ['{"texts":[]}', '{"texts":[]}'] });
    const err = await chainDriver([A], prompts, { fetch: f.fetch })
      .summarize({ name: "Rocket", echoes: input.echoes, languages: ["en"], first: false })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ChainExhaustedError);
    expect(String(err.message)).toContain("evidenceEchoIds");
  });

  test("a key outside the contract is refused, not dropped, and named in the repair (#46)", async () => {
    const extra = { assignments: [{ echoId: "e1", topicId: "t1", url: "https://x.test/" }] };
    const clean = { assignments: [{ echoId: "e1", topicId: "t1" }] };
    const f = fakeFetch({ "a.test": [JSON.stringify(extra), JSON.stringify(clean)] });
    const sent: string[] = [];
    const spy = (async (input: string | URL | Request, init?: RequestInit) => {
      sent.push(String(init?.body));
      return f.fetch(input, init);
    }) as typeof fetch;
    const r = await chainDriver([A], prompts, { fetch: spy }).assign(input);
    expect(r.value).toEqual(clean);
    expect(r.repaired).toBe(true);
    expect(sent[1]).toContain("url");
  });

  test("the key is in no error the chain throws", async () => {
    const key = "sk-test-not-a-real-key";
    const f = fakeFetch({ "a.test": [401] });
    const err = await chainDriver([{ ...A, apiKey: key }], prompts, { fetch: f.fetch })
      .assign(input)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ChainExhaustedError);
    expect(f.calls[0]?.auth).toBe(`Bearer ${key}`);
    expect(JSON.stringify({ message: err.message, attempts: err.attempts })).not.toContain(key);
  });

  test("sends the messages the injected prompts give", async () => {
    const answer = { assignments: [{ echoId: "e1", topicId: "t1" }] };
    const sent: unknown[] = [];
    const f = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)).messages);
      return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
    }) as typeof fetch;
    await chainDriver([A], prompts, { fetch: f }).assign(input);
    expect(sent).toEqual([[{ role: "user", content: JSON.stringify(input) }]]);
  });

  test("an empty chain fails every call", async () => {
    await expect(chainDriver([], prompts).assign(input)).rejects.toBeInstanceOf(
      ChainExhaustedError,
    );
  });

  test("each task's prompt version goes on its result and calls", async () => {
    const answer = { assignments: [{ echoId: "e1", topicId: "t1" }] };
    const f = fakeFetch({ "a.test": [JSON.stringify(answer), '{"texts":[]}', '{"texts":[]}'] });
    const driver = chainDriver(
      [A],
      { ...prompts, versions: { assign: "assign-1" } },
      {
        fetch: f.fetch,
      },
    );
    const r = await driver.assign(input);
    expect(r.promptVersion).toBe("assign-1");
    expect(r.calls.map((c) => c.promptVersion)).toEqual(["assign-1"]);
    const err = await driver
      .summarize({ name: "Rocket", echoes: input.echoes, languages: ["en"], first: false })
      .catch((e) => e);
    expect(callsOf(err).map((c) => c.promptVersion)).toEqual([null, null]);
  });
});
