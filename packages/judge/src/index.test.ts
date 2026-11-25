import { describe, expect, test } from "bun:test";
import {
  ChainExhaustedError,
  callChain,
  chainDriver,
  parseJson,
  type ResolvedProvider,
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

/** Fake fetch: answers per host from a queue; a number means an HTTP status. */
function fakeFetch(script: Record<string, (string | number)[]>) {
  const calls: { url: string; auth: string | null; messages: number }[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as { messages: unknown[] };
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get("authorization"), messages: body.messages.length });
    const next = script[new URL(url).host]?.shift();
    if (typeof next === "number") return new Response("nope", { status: next });
    return Response.json({ choices: [{ message: { content: next ?? "" } }] });
  };
  return { fetch: impl as typeof fetch, calls };
}

const messages = [{ role: "user" as const, content: "go" }];

describe("callChain", () => {
  test("returns the first valid answer and sends the key", async () => {
    const f = fakeFetch({ "a.test": ['{"n":1}'] });
    const r = await callChain([A, B], messages, validate, { fetch: f.fetch });
    expect(r).toEqual({ value: { n: 1 }, provider: "a", model: "m-a", repaired: false });
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

describe("parseJson", () => {
  test("handles bare, fenced and invalid text", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('text\n```\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJson("not json")).toBeUndefined();
  });
});

describe("chainDriver", () => {
  const input = { echoes: [{ id: "e1", title: "Rocket ships" }], topics: [] };

  test("asks the chain and returns an answer that passes the assign contract", async () => {
    const answer = { assignments: [{ echoId: "e1", newTopic: { name: "Rocket" } }] };
    const f = fakeFetch({ "a.test": [JSON.stringify(answer)] });
    const r = await chainDriver([A], { fetch: f.fetch }).assign(input);
    expect(r).toEqual({ value: answer, provider: "a", model: "m-a", repaired: false });
    expect(f.calls[0]?.auth).toBe("Bearer k");
  });

  test("an answer the contract refuses is repaired once, then the next provider is asked", async () => {
    const answer = { assignments: [{ echoId: "e1", topicId: "t1" }] };
    const f = fakeFetch({
      "a.test": ['{"assignments":"x"}', "{}"],
      "b.test": [JSON.stringify(answer)],
    });
    const r = await chainDriver([A, B], { fetch: f.fetch }).assign(input);
    expect(r.provider).toBe("b");
    expect(f.calls).toHaveLength(3);
  });

  test("summarize checks the summarize contract", async () => {
    const f = fakeFetch({ "a.test": ['{"texts":[]}', '{"texts":[]}'] });
    const err = await chainDriver([A], { fetch: f.fetch })
      .summarize({ name: "Rocket", echoes: input.echoes, languages: ["en"], first: false })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ChainExhaustedError);
    expect(String(err.message)).toContain("evidenceEchoIds");
  });

  test("the key is in no error the chain throws", async () => {
    const key = "sk-test-not-a-real-key";
    const f = fakeFetch({ "a.test": [401] });
    const err = await chainDriver([{ ...A, apiKey: key }], { fetch: f.fetch })
      .assign(input)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ChainExhaustedError);
    expect(f.calls[0]?.auth).toBe(`Bearer ${key}`);
    expect(JSON.stringify({ message: err.message, attempts: err.attempts })).not.toContain(key);
  });

  test("an empty chain fails every call", async () => {
    await expect(chainDriver([]).assign(input)).rejects.toBeInstanceOf(ChainExhaustedError);
  });
});
