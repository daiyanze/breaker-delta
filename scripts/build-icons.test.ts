import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ICON_FILES } from "../apps/web/src/core/icon.ts";
import { ICON_DIR, iconBytes } from "./build-icons.ts";

describe("icon files", () => {
  test("public/icons holds exactly the files ICON_FILES names", () => {
    expect(readdirSync(ICON_DIR).sort()).toEqual(ICON_FILES.map((f) => f.file).sort());
  });

  test("each file is what `bun run icons` writes from the drawing", () => {
    for (const f of ICON_FILES) {
      const onDisk = new Uint8Array(readFileSync(join(ICON_DIR, f.file)));
      expect({ file: f.file, same: Buffer.compare(onDisk, iconBytes(f)) === 0 }).toEqual({
        file: f.file,
        same: true,
      });
    }
  }, 60_000);

  test("each PNG is its stated size", () => {
    for (const f of ICON_FILES) {
      if (f.size === undefined) continue;
      const png = readFileSync(join(ICON_DIR, f.file));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([f.size, f.size]);
    }
  });
});
