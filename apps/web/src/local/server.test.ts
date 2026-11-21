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
