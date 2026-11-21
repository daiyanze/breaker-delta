import { describe, expect, test } from "bun:test";
import worker from "./index.ts";

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

  test("rejects an unknown fixture set", async () => {
    const res = await get("/?set=nope", { READ_SOURCE: "fixtures" });
    expect(res.status).toBe(404);
  });
});
