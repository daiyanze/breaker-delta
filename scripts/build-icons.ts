/**
 * Writes the icon files (issue #108) to `apps/web/public/icons`: the SVGs as
 * drawn by `apps/web/src/core/icon.ts`, and the PNGs rendered from them with
 * resvg. Run `bun run icons` after changing the drawing or the tokens;
 * `build-icons.test.ts` fails until the folder matches.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ICON_FILES, type IconFile } from "../apps/web/src/core/icon.ts";

export const ICON_DIR = join(import.meta.dir, "../apps/web/public/icons");

/** The bytes of one icon file. */
export function iconBytes(f: IconFile): Uint8Array {
  if (f.size === undefined) return new TextEncoder().encode(f.source);
  const image = new Resvg(f.source, { fitTo: { mode: "width", value: f.size } }).render();
  return new Uint8Array(image.asPng());
}

if (import.meta.main) {
  mkdirSync(ICON_DIR, { recursive: true });
  for (const f of ICON_FILES) writeFileSync(join(ICON_DIR, f.file), iconBytes(f));
  console.log(`wrote ${ICON_FILES.length} files to ${ICON_DIR}`);
}
