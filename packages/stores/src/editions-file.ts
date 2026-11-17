// Directory-backed edition loading: the fs wrapper over the pure
// parser in editions.ts (kept separate so browser-targeted bundles
// can import the parser without node:fs).

import * as fs from "node:fs";
import * as path from "node:path";

import type { Edition } from "@breaker-delta/core";

import {
  editionsFromFiles,
  parseEditionFiles,
  type EditionFileEntry,
  type ParseEditionOptions,
} from "./editions.js";

/** Load every *.json in an editions directory; a missing directory
 *  yields no editions (matching all three historical loaders). */
export function loadEditionFilesFromDir(
  editionsDir: string,
  opts: ParseEditionOptions = {},
): EditionFileEntry[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(editionsDir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  return parseEditionFiles(
    names.map((n) => ({ name: n, text: fs.readFileSync(path.join(editionsDir, n), "utf-8") })),
    opts,
  );
}

/** Just the editions from a directory, in canonical order. */
export function loadEditionsFromDir(
  editionsDir: string,
  opts: ParseEditionOptions = {},
): Edition[] {
  return loadEditionFilesFromDir(editionsDir, opts).map((e) => e.data);
}

export { editionsFromFiles };
