/**
 * Dependency-direction check. Fails CI when a package imports something its
 * role forbids. Rules mirror CLAUDE.md "Architecture map".
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

interface Rule {
  dir: string;
  /** Bare specifiers allowed. Relative imports are always allowed. */
  allow: RegExp[];
  why: string;
}

export const RULES: Rule[] = [
  { dir: "packages/contracts/src", allow: [/^zod$/], why: "contracts hold schemas only" },
  { dir: "packages/core/src", allow: [/^@bd\/contracts$/, /^bun:test$/], why: "core is pure: no IO" },
  {
    dir: "packages/judge/src",
    allow: [/^@bd\/contracts$/, /^bun:test$/],
    why: "judge talks HTTP only; no database, no tools",
  },
  {
    dir: "packages/db/src",
    allow: [/^@bd\/contracts$/, /^drizzle-orm(\/.*)?$/, /^bun:test$/],
    why: "db holds schema and queries",
  },
  {
    dir: "apps/web/src",
    allow: [/^@bd\/contracts$/, /^@bd\/db$/, /^cloudflare:/, /^bun:test$/],
    why: "web is read-only: no judge, no pipeline code",
  },
];

const IMPORT = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function files(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(files(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

export function violations(root: string, rules: Rule[] = RULES): string[] {
  const found: string[] = [];
  for (const rule of rules) {
    let list: string[];
    try {
      list = files(join(root, rule.dir));
    } catch {
      continue; // directory not created yet
    }
    for (const file of list) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(IMPORT)) {
        const spec = match[1] ?? match[2];
        if (!spec || spec.startsWith(".")) continue;
        if (!rule.allow.some((re) => re.test(spec))) {
          found.push(`${relative(root, file)} imports "${spec}" (${rule.why})`);
        }
      }
    }
  }
  return found;
}

if (import.meta.main) {
  const found = violations(join(import.meta.dir, ".."));
  if (found.length > 0) {
    console.error(`Dependency-direction violations:\n${found.map((v) => `  - ${v}`).join("\n")}`);
    process.exit(1);
  }
  console.log("dependency directions ok");
}
