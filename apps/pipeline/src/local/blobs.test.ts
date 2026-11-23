import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blobsChecks } from "@bd/ports/conformance";
import { directoryBlobs } from "./blobs.ts";

const dirs: string[] = [];
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bd-blobs-"));
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("a directory passes the Blobs port checks", () => {
  for (const check of blobsChecks(async () => directoryBlobs(join(freshDir(), "blobs")))) {
    test(check.name, () => check.run());
  }
});

describe("directoryBlobs", () => {
  test("refuses a key that could name a file outside the folder", async () => {
    const root = join(freshDir(), "blobs");
    const blobs = directoryBlobs(root);
    for (const key of ["../x", "a/../../x", "/abs", "a//b", "", ".hidden/x", "a\\b", "a/./b"]) {
      await expect(blobs.put(key, "x")).rejects.toThrow("invalid blob key");
      await expect(blobs.get(key)).rejects.toThrow("invalid blob key");
    }
    await expect(blobs.list("../")).rejects.toThrow("invalid blob key");
    expect(existsSync(join(root, "..", "x"))).toBe(false);
  });

  test("leaves no partial files in the listing", async () => {
    const blobs = directoryBlobs(join(freshDir(), "blobs"));
    await Promise.all(["a", "b", "c"].map((k) => blobs.put(`raw/${k}.json`, k)));
    expect(await blobs.list("")).toEqual(["raw/a.json", "raw/b.json", "raw/c.json"]);
  });
});
