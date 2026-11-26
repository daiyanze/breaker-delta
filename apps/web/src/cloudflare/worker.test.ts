import { describe, expect, mock, test } from "bun:test";

// `cloudflare:workers` exists only in the Workers runtime. Bun gets a
// stand-in base class with the runtime's constructor shape (ctx, env), so the
// adapter's own code runs here; the import is dynamic so the stand-in is in
// place first.
mock.module("cloudflare:workers", () => ({
  WorkerEntrypoint: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}));
const { default: worker, SiteCacheEntrypoint } = await import("./worker.ts");

const get = (path: string, env: Record<string, string> = {}) =>
  worker.fetch(new Request(`https://bd.test${path}`), env);

describe("bd-web", () => {
  test("serves the placeholder unless fixtures are switched on", async () => {
    const res = await get("/");
    expect(await res.text()).toContain("2.0 scaffold");
  });

  test("renders the front page from fixtures, with no database", async () => {
    const body = await (await get("/", { READ_SOURCE: "fixtures" })).text();
    expect(body).toContain("The 14:00 edition");
    expect(body).toContain("Chipmaker board rules out bringing back its founder CEO");
    expect(body).toContain("Fixture data.");
  });

  test("picks the language and falls back to the source headline", async () => {
    const body = await (await get("/?lang=ja", { READ_SOURCE: "fixtures" })).text();
    expect(body).toContain('<html lang="ja">');
    expect(body).toContain("半導体大手の取締役会");
    // No model headline yet for this wave: the source's own headline shows.
    expect(body).toContain("Open-weights model released with pricing at 25% of flagship");
  });

  test("renders a fresh install", async () => {
    const body = await (await get("/?set=fresh", { READ_SOURCE: "fixtures" })).text();
    expect(body).toContain("The sea is flat.");
  });

  test("has no component catalog: /_catalog is a local route only (issue 258)", async () => {
    for (const env of [{}, { READ_SOURCE: "fixtures" }]) {
      for (const path of ["/_catalog", "/_catalog?theme=dark&lang=ja"]) {
        const res = await get(path, env);
        expect(res.status).toBe(404);
        expect(await res.text()).not.toContain("data-shot");
      }
    }
  });

  test("rejects an unknown fixture set", async () => {
    const res = await get("/?set=nope", { READ_SOURCE: "fixtures" });
    expect(res.status).toBe(404);
  });
});

describe("the SiteCache entrypoint (#35)", () => {
  test("receives the publish step's purge and answers with the placeholder", async () => {
    const entry = new SiteCacheEntrypoint({} as ExecutionContext, {});
    const request = { slot: "20261119T0500", topicIds: ["t1", "t2"] };
    expect(await entry.purge(request)).toEqual({ purged: 0 });
  });

  test("is not a route: the public URL has no purge", async () => {
    for (const path of ["/purge", "/__purge"]) {
      expect((await get(path)).status).toBe(404);
    }
  });
});
