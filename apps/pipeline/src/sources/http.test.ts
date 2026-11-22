import { describe, expect, test } from "bun:test";
import { fetchSource, USER_AGENT } from "./http.ts";

/** A fetch that answers from a list, one response (or error) per call, and records each call. */
function scripted(answers: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (!next) throw new Error("no more answers");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { f, calls };
}

const waits: number[] = [];
const sleep = async (ms: number) => {
  waits.push(ms);
};
const opts = (f: typeof fetch) => ({
  fetch: f,
  sleep,
  timeoutMs: 1000,
  retries: 2,
  retryDelayMs: 100,
});

describe("fetchSource", () => {
  test("returns the body, status and content type, with the user agent and a timeout", async () => {
    const { f, calls } = scripted([
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    ]);
    const r = await fetchSource("https://x.test/a", opts(f));
    expect(r).toEqual({
      ok: true,
      url: "https://x.test/a",
      status: 200,
      contentType: "application/json",
      body: "[]",
      attempts: 1,
    });
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["user-agent"]).toBe(USER_AGENT);
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("retries 5xx, 429 and network errors with doubling waits", async () => {
    waits.length = 0;
    const { f } = scripted([
      new Response("", { status: 503 }),
      new Error("connection reset"),
      new Response("ok", { status: 200 }),
    ]);
    const r = await fetchSource("https://x.test/", opts(f));
    expect(r).toMatchObject({ ok: true, body: "ok", attempts: 3 });
    expect(waits).toEqual([100, 200]);

    const limited = scripted([new Response("", { status: 429 }), new Response("ok")]);
    expect(await fetchSource("https://x.test/", opts(limited.f))).toMatchObject({
      ok: true,
      attempts: 2,
    });
  });

  test("gives up after the last retry and reports the last failure", async () => {
    const { f, calls } = scripted([
      new Response("", { status: 500 }),
      new Response("", { status: 502 }),
      new Response("", { status: 503 }),
    ]);
    const r = await fetchSource("https://x.test/", opts(f));
    expect(r).toEqual({
      ok: false,
      url: "https://x.test/",
      status: 503,
      error: "HTTP 503",
      attempts: 3,
    });
    expect(calls).toHaveLength(3);
  });

  test("does not retry a 4xx other than 429", async () => {
    const { f, calls } = scripted([new Response("", { status: 404 })]);
    const r = await fetchSource("https://x.test/", opts(f));
    expect(r).toMatchObject({ ok: false, status: 404, error: "HTTP 404", attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  test("a timeout is a failed attempt, not a throw", async () => {
    const { f } = scripted([
      new DOMException("The operation timed out.", "TimeoutError"),
      new DOMException("The operation timed out.", "TimeoutError"),
      new DOMException("The operation timed out.", "TimeoutError"),
    ]);
    const r = await fetchSource("https://x.test/", opts(f));
    expect(r).toMatchObject({ ok: false, status: null, attempts: 3 });
    if (!r.ok) expect(r.error).toContain("timed out");
  });

  test("the timeout really aborts a hanging fetch", async () => {
    const hang = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const r = await fetchSource("https://x.test/", {
      fetch: hang,
      timeoutMs: 20,
      retries: 0,
      retryDelayMs: 0,
    });
    expect(r).toMatchObject({ ok: false, status: null, attempts: 1 });
  });

  test("retries 0 means one attempt", async () => {
    const { f, calls } = scripted([new Response("", { status: 500 })]);
    const r = await fetchSource("https://x.test/", { ...opts(f), retries: 0 });
    expect(r).toMatchObject({ ok: false, attempts: 1 });
    expect(calls).toHaveLength(1);
  });
});
