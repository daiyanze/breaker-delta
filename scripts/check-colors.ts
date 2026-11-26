/**
 * No colour value is hard-coded in the site's code (issue #104): colours come
 * from `design/system/tokens.json` as CSS variables. Reports every hex, rgb(),
 * hsl() or other colour function literal in `apps/web/src` and in `@bd/ui`
 * outside `tokens` (`SCANNED`), and a colour
 * property set to a keyword such as `red`. Comment lines are skipped, so issue
 * references such as "#104" there are not colours.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// `&#160;` is an HTML character reference, not a colour.
const COLOR =
  /(?<!&)#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;

// A colour property whose value is a word that is not a variable or a
// colour-free keyword: a named colour such as `red` or `white`.
const NAMED =
  /\b(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke|caret-color|accent-color|text-decoration-color|column-rule-color)\s*:\s*(?!(?:var|inherit|initial|unset|revert|currentcolor|transparent|none)\b)([a-z]+)\b(?!\()/gi;

// A comment line: `//`, `/*`, a JSDoc `* ` line or its `*/` end. A `*` followed
// by anything else (`*{color:...}` in a CSS string) is code.
const COMMENT = /^\s*(?:\/\/|\/\*|\*(?:\s|\/|$))/;

function files(dir: string, skip: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (skip.includes(path)) return [];
    if (statSync(path).isDirectory()) return files(path, skip);
    return /\.(ts|tsx|css|html)$/.test(name) ? [path] : [];
  });
}

/**
 * The folders scanned: the site's code, and `@bd/ui` outside `tokens`, the
 * one layer that holds the values (ADR 0020, section 4).
 */
export const SCANNED = ["apps/web/src", "packages/ui/src"] as const;
const SKIPPED = ["packages/ui/src/tokens"];

export function hardCodedColors(root: string, dirs: readonly string[] = SCANNED): string[] {
  const found: string[] = [];
  const skip = SKIPPED.map((d) => join(root, d));
  for (const file of dirs.flatMap((dir) => files(join(root, dir), skip))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (COMMENT.test(line)) return;
      const code = line.replace(/\s\/\/.*$/, "");
      for (const m of [...code.matchAll(COLOR), ...code.matchAll(NAMED)]) {
        found.push(`${relative(root, file)}:${i + 1}: "${m[0]}" (use a token from tokens.json)`);
      }
    });
  }
  return found;
}

if (import.meta.main) {
  const found = hardCodedColors(join(import.meta.dir, ".."));
  for (const line of found) console.error(line);
  if (found.length > 0) process.exit(1);
  console.log(`check-colors: no hard-coded colour in ${SCANNED.join(", ")} (outside tokens)`);
}
