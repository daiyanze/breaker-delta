/**
 * ADR 0020, section 3: every `.tsx` file names its own JSX runtime on its
 * first line. Bun reads JSX settings from the tsconfig of the working
 * directory, not of the file, so without the pragma `bun test` and local
 * mode started from the repository root compile it for React.
 * `packages/mail` is React Email (section 7); everything else is Preact.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const PREACT_PRAGMA = "/** @jsxImportSource preact */";
export const REACT_PRAGMA = "/** @jsxImportSource react */";

/** The pragma a `.tsx` file at `path` (relative to the root) must start with. */
export function pragmaFor(path: string): string {
  return path.startsWith("packages/mail/") ? REACT_PRAGMA : PREACT_PRAGMA;
}

const SKIP = new Set(["node_modules", ".git", "dist", ".wrangler", ".wrangler-dist"]);

function tsxFiles(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(tsxFiles(path));
    else if (name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/** Each `.tsx` under `apps`, `packages` and `scripts` whose first line is not its pragma. */
export function pragmaProblems(root: string): string[] {
  const found: string[] = [];
  for (const top of ["apps", "packages", "scripts"]) {
    if (!existsSync(join(root, top))) continue;
    for (const file of tsxFiles(join(root, top))) {
      const path = relative(root, file);
      const want = pragmaFor(path);
      const first = readFileSync(file, "utf8").split(/\r?\n/, 1)[0];
      if (first !== want) found.push(`${path}: the first line is not ${want} (ADR 0020)`);
    }
  }
  return found;
}
