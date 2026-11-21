/**
 * Dependency-direction check. Fails CI when a package imports something its
 * role forbids. Rules mirror CLAUDE.md "Architecture map".
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

interface Rule {
  dir: string;
  /** Bare specifiers allowed. Relative imports are always allowed. */
  allow: RegExp[];
  why: string;
}

const PORTS = /^@bd\/ports(\/conformance)?$/;
/** Drizzle core and its proxy driver only: native drivers would bind one runtime. */
const DRIZZLE = /^drizzle-orm(\/sqlite-core|\/sqlite-proxy)?$/;

export const RULES: Rule[] = [
  { dir: "packages/contracts/src", allow: [/^zod$/], why: "contracts hold schemas only" },
  { dir: "packages/ports/src", allow: [], why: "ports are interfaces: no imports" },
  {
    dir: "packages/core/src",
    allow: [/^@bd\/contracts$/, /^bun:test$/],
    why: "core is pure: no IO",
  },
  {
    dir: "packages/judge/src",
    allow: [/^@bd\/contracts$/, /^bun:test$/],
    why: "judge talks HTTP only; no database, no tools",
  },
  {
    dir: "packages/fixtures/src",
    allow: [/^@bd\/contracts$/, /^bun:test$/],
    why: "fixtures are data behind the read contracts: no database, no IO",
  },
  {
    dir: "packages/db/src",
    allow: [/^@bd\/contracts$/, PORTS, DRIZZLE, /^bun:test$/],
    why: "db holds schema and queries, on the Database port",
  },
  // ADR 0018: app cores run on any runtime, so no `cloudflare:*` and no Bun APIs.
  {
    dir: "apps/pipeline/src/core",
    allow: [/^@bd\/(contracts|core|db|judge)$/, PORTS, DRIZZLE, /^bun:test$/],
    why: "the pipeline core depends on ports only (ADR 0018)",
  },
  {
    dir: "apps/pipeline/src/sources",
    allow: [/^@bd\/(contracts|core)$/, PORTS, /^bun:test$/],
    why: "source adapters use standard fetch only (ADR 0018)",
  },
  {
    dir: "apps/pipeline/src/cloudflare",
    allow: [/^@bd\/(contracts|core|db|judge)$/, PORTS, DRIZZLE, /^cloudflare:/, /^bun:test$/],
    why: "the Cloudflare adapter maps bindings onto ports; no Bun APIs (ADR 0018)",
  },
  {
    dir: "apps/pipeline/src/local",
    allow: [/^@bd\/(contracts|core|db)$/, PORTS, /^bun:/, /^node:/],
    why: "the local adapter runs on Bun, never on Cloudflare APIs (ADR 0018)",
  },
  {
    dir: "apps/web/src/core",
    allow: [/^@bd\/contracts$/, PORTS, /^bun:test$/],
    why: "the site core reads through the read contracts only (ADR 0018)",
  },
  {
    dir: "apps/web/src",
    allow: [/^@bd\/(contracts|db|fixtures)$/, PORTS, /^cloudflare:/, /^bun:test$/],
    why: "web is read-only: no judge, no pipeline code",
  },
];

const IMPORT =
  /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

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
