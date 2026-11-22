/**
 * No colour value is hard-coded in the site's code (issue #104): colours come
 * from `design/system/tokens.json` as CSS variables. Reports every hex, rgb(),
 * hsl() or other colour function literal in `apps/web/src`. Comments are
 * skipped, so issue references such as "#104" there are not colours.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// `&#160;` is an HTML character reference, not a colour.
const COLOR =
  /(?<!&)#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx|css|html)$/.test(name) ? [path] : [];
  });
}

export function hardCodedColors(root: string, dir = "apps/web/src"): string[] {
  const found: string[] = [];
  for (const file of files(join(root, dir))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
      const code = line.replace(/\s\/\/.*$/, "");
      for (const m of code.matchAll(COLOR)) {
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
  console.log("check-colors: no hard-coded colour in apps/web/src");
}
