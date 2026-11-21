import { describe, expect, test } from "bun:test";
import { probeAll, probeOne } from "./probe.ts";
import { PROBE_TARGETS } from "./probe-targets.ts";

describe("probe", () => {
  test("reports status and size on success", async () => {
    const f = (async () => new Response("hello", { status: 200 })) as unknown as typeof fetch;
    const r = await probeOne({ groupId: "g", url: "https://x.test/" }, f);
    expect(r).toMatchObject({ groupId: "g", ok: true, status: 200, bytes: 5, error: null });
  });

  test("reports blocked responses as not ok", async () => {
    const f = (async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    const r = await probeOne({ groupId: "g", url: "https://x.test/" }, f);
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  test("reports transport errors without throwing", async () => {
    const f = (async () => {
      throw new Error("connection reset");
    }) as unknown as typeof fetch;
    const [r] = await probeAll([{ groupId: "g", url: "https://x.test/" }], f);
    expect(r).toMatchObject({ ok: false, status: null, error: "connection reset" });
  });

  test("launch targets have unique group ids and https urls", () => {
    const ids = PROBE_TARGETS.map((t) => t.groupId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of PROBE_TARGETS) expect(new URL(t.url).protocol).toBe("https:");
  });
});
