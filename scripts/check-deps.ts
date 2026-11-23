/**
 * Dependency-direction check. Fails CI when a package imports something its
 * role forbids. Rules mirror AGENTS.md "Architecture map".
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

interface Rule {
  dir: string;
  /** Bare specifiers allowed. */
  allow: RegExp[];
  /**
   * Other rules' areas in the same package that this area may import by
   * relative path (#209). Its own files are always allowed.
   */
  reach?: string[];
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
  // #18: only code with its own rule allowing `@bd/private-db` may name the
  // private tables. No content-database rule allows it.
  {
    dir: "packages/private-db/src",
    allow: [/^@bd\/contracts$/, DRIZZLE, /^bun:test$/],
    why: "the private schema is subscriber data only; it knows nothing of the content database",
  },
  // ADR 0018: app cores run on any runtime, so no `cloudflare:*` and no Bun APIs.
  {
    dir: "apps/pipeline/src/core",
    allow: [/^@bd\/(contracts|core|db|judge)$/, PORTS, DRIZZLE, /^bun:test$/],
    reach: ["apps/pipeline/src/sources"],
    why: "the pipeline core depends on ports only (ADR 0018)",
  },
  {
    dir: "apps/pipeline/src/sources",
    allow: [/^@bd\/(contracts|core)$/, PORTS, /^fast-xml-parser$/, /^bun:test$/],
    why: "source adapters use standard fetch and one XML parser only (ADR 0018)",
  },
  {
    dir: "apps/pipeline/src/cloudflare",
    allow: [/^@bd\/(contracts|core|db|judge)$/, PORTS, DRIZZLE, /^cloudflare:/, /^bun:test$/],
    reach: ["apps/pipeline/src/core"],
    why: "the Cloudflare adapter maps bindings onto ports; no Bun APIs (ADR 0018)",
  },
  {
    dir: "apps/pipeline/src/local",
    allow: [/^@bd\/(contracts|core|db)$/, PORTS, /^bun:/, /^node:/],
    reach: ["apps/pipeline/src/core"],
    why: "the local adapter runs on Bun, never on Cloudflare APIs (ADR 0018)",
  },
  {
    dir: "apps/web/src/select.ts",
    allow: [/^@bd\/(contracts|fixtures)$/, PORTS],
    reach: ["apps/web/src/core"],
    why: "the query-layer choice is shared by both adapters: no runtime APIs (ADR 0018)",
  },
  {
    dir: "apps/web/src/local",
    allow: [/^@bd\/(contracts|fixtures)$/, PORTS, /^bun:/, /^node:/],
    reach: ["apps/web/src/core", "apps/web/src/select.ts"],
    why: "the local site adapter runs on Bun, never on Cloudflare APIs (ADR 0018)",
  },
  {
    dir: "apps/local",
    allow: [/^@bd\/(pipeline|web)\/local$/, /^bun:/, /^node:/],
    why: "local mode starts the local adapters only: no wrangler, no Cloudflare (ADR 0018)",
  },
  {
    dir: "apps/web/src/core",
    allow: [/^@bd\/contracts$/, PORTS, /^bun:test$/],
    why: "the site core reads through the read contracts only (ADR 0018)",
  },
  {
    dir: "apps/web/src",
    allow: [/^@bd\/(contracts|db|fixtures)$/, PORTS, /^cloudflare:/, /^bun:test$/],
    reach: ["apps/web/src/core", "apps/web/src/select.ts"],
    why: "web is read-only: no judge, no pipeline code",
  },
];

/**
 * Package imports are read with this pattern, so a type-only import of a
 * forbidden package fails too: import statements, and `import(...)` or
 * `require(...)` calls whose first argument is a string or a template
 * without `${}`. A call must not follow a name character or a dot, so
 * `loader.require("x")` is not one; `import.meta.require("x")` is. Relative
 * imports are read by Bun's own parser instead (`relativeImports`, L14).
 */
const IMPORT = new RegExp(
  [
    String.raw`(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]`,
    String.raw`(?:^|[^\w$.])(?:import|require)\(\s*(?:['"]([^'"]+)['"]|\x60([^\x60$]+)\x60)\s*[,)]`,
    String.raw`import\.meta\.require\(\s*['"]([^'"]+)['"]`,
  ].join("|"),
  "gm",
);

/** The specifier an IMPORT match captured. */
const specOf = (m: RegExpMatchArray) => m[1] ?? m[2] ?? m[3] ?? m[4];

function files(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(files(path));
    else if (CODE.test(name)) out.push(path);
  }
  return out;
}

export function violations(root: string, rules: Rule[] = RULES): string[] {
  const found: string[] = [];
  for (const rule of rules) {
    const target = join(root, rule.dir);
    if (!existsSync(target)) continue; // not created yet
    // A rule names a directory or a single file.
    const list = statSync(target).isDirectory() ? files(target) : [target];
    for (const file of list) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(IMPORT)) {
        const spec = specOf(match);
        if (!spec || spec.startsWith(".")) continue;
        if (!rule.allow.some((re) => re.test(spec))) {
          found.push(`${relative(root, file)} imports "${spec}" (${rule.why})`);
        }
      }
    }
  }
  return found;
}

/** A TypeScript source file. */
const CODE = /\.[cm]?tsx?$/;

/** One parser per loader: a tsx parser rejects valid `.ts` such as `<T>(x: T) => x`. */
const TS = new Bun.Transpiler({ loader: "ts" });
const TSX = new Bun.Transpiler({ loader: "tsx" });

/**
 * Two forms Bun's parser drops that still load at run time: a brace import
 * or export whose first name is `type` (verbatimModuleSyntax keeps it as
 * `import {} from`, so the target is bundled), and `import.meta.require`.
 */
const KEPT = new RegExp(
  [
    String.raw`(?:^|[;\s])(?:import|export)\s*\{\s*type\s[^}]*\}\s*from\s*['"](\.[^'"]*)['"]`,
    String.raw`import\.meta\.require\(\s*['"](\.[^'"]*)['"]`,
  ].join("|"),
  "gm",
);

/**
 * Relative imports that load at run time, resolved to real paths. Bun's
 * parser reads statements, `import()` and `require()` (with options or a
 * template without `${}`), and skips comments, strings and type-only
 * imports; `KEPT` adds the two forms it drops. Bun's resolver maps `./x.js`
 * to `x.ts`, finds `x.tsx` and an index, and follows symlinks. A path it
 * cannot resolve is kept as written. Throws when the file does not parse.
 */
function relativeImports(file: string): { spec: string; target: string }[] {
  const source = readFileSync(file, "utf8");
  const parser = /\.tsx$/.test(file) ? TSX : TS;
  const specs = new Set(parser.scanImports(source).map((i) => i.path));
  for (const m of source.matchAll(KEPT)) specs.add((m[1] ?? m[2]) as string);
  const out: { spec: string; target: string }[] = [];
  for (const spec of specs) {
    if (!spec.startsWith(".")) continue;
    let target: string;
    try {
      target = Bun.resolveSync(spec, dirname(file));
    } catch {
      target = resolve(dirname(file), spec);
    }
    out.push({ spec, target: existsSync(target) ? realpathSync(target) : target });
  }
  return out;
}

/**
 * Issue #210: every source file under `packages/<x>/src` or `apps/<x>/src`
 * falls under a rule, so none of them is outside the dependency check.
 */
export function uncovered(root: string, rules: Rule[] = RULES): string[] {
  const found: string[] = [];
  for (const group of ["packages", "apps"]) {
    if (!existsSync(join(root, group))) continue;
    for (const name of readdirSync(join(root, group))) {
      const src = join(root, group, name, "src");
      if (!existsSync(src) || !statSync(src).isDirectory()) continue;
      for (const file of files(src)) {
        const path = relative(root, file);
        if (!areaOf(path, rules)) {
          const fix = "add a rule for it or move it under one (#210)";
          found.push(`${path} is under no check-deps rule: ${fix}`);
        }
      }
    }
  }
  return found;
}

/** For the lesson-L1 check; a file that does not parse is reported by relativeViolations. */
function runtimeImports(file: string): string[] {
  try {
    return relativeImports(file).map((i) => i.target);
  } catch {
    return [];
  }
}

/**
 * A specifier with an extension that is not a script's, and that does not
 * resolve to a `.ts`/`.tsx` file, is a data file: JSON, SQL, a font.
 */
const DATA = /\.(?!(?:[cm]?[jt]sx?)$)[A-Za-z0-9]+$/;

/** The most specific rule whose area holds `path` (relative to the root). */
function areaOf(path: string, rules: Rule[]): Rule | undefined {
  return rules
    .filter((r) => path === r.dir || path.startsWith(`${r.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
}

/** `packages/<x>` or `apps/<x>`, the workspace package a path is in. */
function packageOf(path: string): string | undefined {
  const [group, name] = path.split("/");
  return (group === "packages" || group === "apps") && name ? `${group}/${name}` : undefined;
}

/**
 * Issue #209: relative imports follow the dependency rules too. Code in
 * another workspace package must be imported by its package name, so that
 * package's rule applies; inside a package, an area may import another
 * rule's area only if its rule lists it in `reach`. Data files are not
 * code and pass; files no rule covers are not checked here.
 */
export function relativeViolations(root: string, rules: Rule[] = RULES): string[] {
  const found: string[] = [];
  const real = realpathSync(root);
  for (const rule of rules) {
    const dir = join(root, rule.dir);
    if (!existsSync(dir)) continue;
    const list = statSync(dir).isDirectory() ? files(dir) : [dir];
    for (const file of list) {
      const from = relative(root, file);
      if (areaOf(from, rules) !== rule) continue; // checked under its most specific rule
      let imports: { spec: string; target: string }[];
      try {
        imports = relativeImports(file);
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        found.push(`${from} could not be parsed: ${why}`);
        continue;
      }
      for (const { spec, target } of imports) {
        if (DATA.test(spec) && !CODE.test(target)) continue;
        // Resolved through any symlink, so a link cannot carry an import elsewhere.
        const to = existsSync(target) ? relative(real, target) : relative(root, target);
        const pkg = packageOf(to);
        const head = `${from} imports "${spec}"`;
        if (pkg !== packageOf(from)) {
          const fix = "import it by its package name so its rule applies (#209)";
          found.push(`${head}, code in ${pkg ?? to}: ${fix}`);
          continue;
        }
        const area = areaOf(to, rules);
        if (!area) {
          // Code no rule covers would be an unchecked way between two areas.
          const fix = "nothing checks what it imports; move it under src (#210)";
          found.push(`${head}, which no check-deps rule covers, so ${fix}`);
          continue;
        }
        if (area === rule || rule.reach?.includes(area.dir)) continue;
        const may = rule.reach?.length ? `only ${rule.reach.join(", ")}` : "none";
        const limit = `${rule.dir} may reach ${may} by relative path`;
        found.push(`${head}, which is in ${area.dir}; ${limit} (${rule.why})`);
      }
    }
  }
  return found;
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
      let entry = join(root, group, name, "src", "index.ts");
      let list: string[];
      try {
        // Real paths, as relativeImports resolves them.
        list = files(dirname(entry)).map((f) => realpathSync(f));
        if (existsSync(entry)) entry = realpathSync(entry);
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
          const at = relative(realpathSync(root), file);
          found.push(`${at} and its package entry import each other (lesson L1)`);
        }
      }
    }
  }
  return found;
}

const FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/**
 * Issue #3: every dependency names a version range. `latest`, `*` or an
 * empty spec lets an install pick up a new major release unannounced.
 */
export function unpinned(root: string): string[] {
  const found: string[] = [];
  const manifests = [join(root, "package.json")];
  for (const group of ["packages", "apps"]) {
    if (!existsSync(join(root, group))) continue;
    for (const name of readdirSync(join(root, group))) {
      manifests.push(join(root, group, name, "package.json"));
    }
  }
  for (const path of manifests) {
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    for (const field of FIELDS) {
      const deps = (manifest[field] ?? {}) as Record<string, string>;
      for (const [dep, spec] of Object.entries(deps)) {
        if (spec === "latest" || spec === "*" || spec.trim() === "") {
          found.push(`${relative(root, path)}: ${dep} is "${spec}"; name a version range (#3)`);
        }
      }
    }
  }
  return found;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const found = [
    ...violations(root),
    ...relativeViolations(root),
    ...uncovered(root),
    ...selfImports(root),
    ...unpinned(root),
  ];
  if (found.length > 0) {
    console.error(`check-deps found:\n${found.map((v) => `  - ${v}`).join("\n")}`);
    process.exit(1);
  }
  console.log("dependency directions ok");
}
