import { afterAll, describe, expect, test } from "bun:test";
import { startSite } from "./server.ts";

const placeholder = startSite({ port: 0, vars: {} });
const fixtures = startSite({ port: 0, vars: { READ_SOURCE: "fixtures" } });
afterAll(async () => {
  await placeholder.stop();
  await fixtures.stop();
});

describe("the local site server", () => {
  test("listens on localhost by default", () => {
    expect(placeholder.url).toStartWith("http://127.0.0.1:");
  });

  test("serves the same site core as Cloudflare", async () => {
    expect(await (await fetch(`${placeholder.url}/`)).text()).toContain("2.0 scaffold");
    expect(await (await fetch(`${fixtures.url}/`)).text()).toContain("The 14:00 edition");
    expect((await fetch(`${fixtures.url}/health`)).status).toBe(200);
  });
});

describe("the local site's purge (#35)", () => {
  test("receives the call in process, logs ids and counts, and has no route", async () => {
    const lines: string[] = [];
    const site = startSite({ port: 0, vars: {}, log: (l) => lines.push(l) });
    try {
      const result = await site.purge({ slot: "20261119T0500", topicIds: ["t1", "t2"] });
      expect(result).toEqual({ purged: 0 });
      expect(lines).toEqual(["[site] purge 20261119T0500: 2 topics, 0 dropped"]);
      expect((await fetch(`${site.url}/__purge`, { method: "POST" })).status).toBe(404);
    } finally {
      await site.stop();
    }
  });
});
