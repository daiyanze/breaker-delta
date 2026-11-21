/**
 * Dependency-direction check. Fails CI when a package imports something its
 * role forbids. Rules mirror CLAUDE.md "Architecture map".
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

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

/** Relative imports that exist at run time (`import type` is erased). */
function runtimeImports(file: string): string[] {
  const out: string[] = [];
  for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
    const spec = match[1] ?? match[2];
    if (!spec?.startsWith(".") || /^(import|export)\s+type\s/.test(match[0])) continue;
    const target = resolve(dirname(file), spec);
    // Bundler resolution also accepts "./index", "." and "./dir".
    const candidates = [target, `${target}.ts`, join(target, "index.ts")];
    out.push(candidates.find((c) => /\.tsx?$/.test(c) && existsSync(c)) ?? target);
  }
  return out;
}

/**
 * Lesson L1 (docs/lessons.md): a module must not import its own package's
 * `index.ts` when that entry, directly or through re-exports, imports the
 * module back. That is an ES module cycle, and one side reads the other's
 * exports before they are defined.
 */
export function selfImports(root: string): string[] {
  const found: string[] = [];
  for (const group of ["packages", "apps"]) {
    let names: string[];
    try {
      names = readdirSync(join(root, group));
    } catch {
      continue;
    }
    for (const name of names) {
      const entry = join(root, group, name, "src", "index.ts");
      let list: string[];
      try {
        list = files(dirname(entry));
      } catch {
        continue;
      }
      // Everything the entry reaches at run time.
      const reached = new Set<string>();
      const queue = [entry];
      while (queue.length > 0) {
        const next = queue.pop() as string;
        if (reached.has(next) || !list.includes(next)) continue;
        reached.add(next);
        queue.push(...runtimeImports(next));
      }
      for (const file of list) {
        if (file === entry || !reached.has(file)) continue;
        if (runtimeImports(file).includes(entry)) {
          found.push(`${relative(root, file)} and its package entry import each other (lesson L1)`);
        }
      }
    }
  }
  return found;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const found = [...violations(root), ...selfImports(root)];
  if (found.length > 0) {
    console.error(`Dependency-direction violations:\n${found.map((v) => `  - ${v}`).join("\n")}`);
    process.exit(1);
  }
  console.log("dependency directions ok");
}
