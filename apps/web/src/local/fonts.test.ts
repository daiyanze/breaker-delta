import { afterAll, describe, expect, test } from "bun:test";
import { FONT_FILES } from "@bd/ui/tokens";
import { startSite } from "./server.ts";

const site = startSite({ port: 0, vars: {} });
afterAll(() => site.stop());

const folder = `${import.meta.dir}/../../public/fonts`;

describe("self-hosted fonts on local mode", () => {
  test("every font the styles name is in public/fonts, and nothing else is", () => {
    const files = [...new Bun.Glob("*.woff2").scanSync(folder)];
    expect(files.sort()).toEqual(FONT_FILES.map((f) => f.file).sort());
  });

  test("the local server serves each one, byte for byte", async () => {
    for (const f of FONT_FILES) {
      const res = await fetch(`${site.url}/fonts/${f.file}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("font/woff2");
      const served = new Uint8Array(await res.arrayBuffer());
      const onDisk = new Uint8Array(await Bun.file(`${folder}/${f.file}`).arrayBuffer());
      expect(served).toEqual(onDisk);
    }
  });

  test("an unknown font is a 404", async () => {
    expect((await fetch(`${site.url}/fonts/nope.woff2`)).status).toBe(404);
    expect((await fetch(`${site.url}/fonts/constructor`)).status).toBe(404);
  });
});
