import { afterAll, describe, expect, test } from "bun:test";
import { ICON_FILES, ICON_LINKS } from "../core/icon.ts";
import { ICON_PATHS } from "./icons.ts";
import { startSite } from "./server.ts";

const site = startSite({ port: 0, vars: { READ_SOURCE: "fixtures" } });
afterAll(() => site.stop());

const folder = `${import.meta.dir}/../../public/icons`;

describe("icons on local mode", () => {
  test("the local server embeds every icon file and nothing else", () => {
    expect(Object.keys(ICON_PATHS).sort()).toEqual(ICON_FILES.map((f) => f.file).sort());
  });

  test("serves each one, byte for byte, with its type", async () => {
    for (const f of ICON_FILES) {
      const res = await fetch(`${site.url}/icons/${f.file}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(ICON_PATHS[f.file]?.type ?? "");
      const served = new Uint8Array(await res.arrayBuffer());
      const onDisk = new Uint8Array(await Bun.file(`${folder}/${f.file}`).arrayBuffer());
      expect(served).toEqual(onDisk);
    }
  });

  test("an unknown icon is a 404", async () => {
    expect((await fetch(`${site.url}/icons/nope.png`)).status).toBe(404);
    expect((await fetch(`${site.url}/icons/constructor`)).status).toBe(404);
  });

  test("the front page links the icons", async () => {
    const html = await (await fetch(`${site.url}/`)).text();
    for (const link of ICON_LINKS)
      expect(html).toContain(`<link rel="${link.rel}" href="${link.href}"`);
  });
});
