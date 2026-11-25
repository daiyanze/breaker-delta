import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_FILES } from "./fixtures.ts";

const DIR = join(import.meta.dir, "../sources/fixtures");

describe("embedded fixtures", () => {
  test("every file in src/sources/fixtures is embedded, with its exact text", () => {
    const files = readdirSync(DIR).sort();
    expect(Object.keys(FIXTURE_FILES).sort()).toEqual(files);
    for (const [file, text] of Object.entries(FIXTURE_FILES)) {
      expect(text).toBe(readFileSync(join(DIR, file), "utf8"));
    }
  });
});
