import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildClient } from "../src/build/index.ts";
import { writeClient } from "./write-client.ts";

const root = mkdtempSync(join(tmpdir(), "bd-client-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("write-client", () => {
  test("writes every client file, and removes what an earlier build left", async () => {
    const dir = join(root, "client");
    mkdirSync(dir);
    writeFileSync(join(dir, "old.js"), "stale");
    await writeClient(dir);
    for (const f of await buildClient()) {
      expect(readFileSync(join(dir, f.path), "utf8")).toBe(new TextDecoder().decode(f.body));
    }
    expect(existsSync(join(dir, "old.js"))).toBe(false);
  });

  test("refuses a folder not named client, since it empties it", async () => {
    await expect(writeClient(join(root, "public"))).rejects.toThrow("not a client folder");
  });
});
