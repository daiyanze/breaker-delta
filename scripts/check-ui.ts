/**
 * Pages are built from Tide Paper, not next to it (issue #259, ADR 0020
 * section 12). Fails on:
 *
 * - `colour`: a literal colour in `apps/web/src` or in `packages/ui/src`
 *   outside `tokens`, read by `scripts/check-colors.ts`;
 * - `size`: a `px` or `rem` length in the same folders, in a `.css` file or
 *   a string in code (`readSource` takes them from the parsed file). A
 *   width in a `@media` or `@container` query that the
 *   tokens list as a breakpoint (`BREAKPOINTS`) is the one literal allowed;
 * - `font`: a `font-family` or `font` shorthand that is not a variable;
 * - `global`: `document` or `window` outside a `*.island.tsx`;
 * - `inner-html`: `dangerouslySetInnerHTML` outside `Document`;
 * - `island-import`: an island importing an island, or anything but types
 *   from `@bd/contracts` (a value import or re-export, or a bare import);
 * - `app-css`: a `.css` file in `apps/*`, or a `style` attribute, a
 *   `<style>` element or a class rule in an app's source: a page uses a
 *   `@bd/ui` component and the band layout;
 * - `pragma`: a `.tsx` whose first line is not its JSX pragma
 *   (`scripts/jsx-pragma.ts`);
 * - `component`: a component folder under `primitives` or `patterns`
 *   without its `<Name>.states.tsx` or a `SPEC.md` that follows
 *   `packages/ui/SPEC.md`.
 *
 * The allowed exceptions are `EXCEPTIONS`, each with its reason; one that
 * no longer matches anything fails too, so the list stays true.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import type { Node } from "@babel/types";
import { TWO_COLUMNS_FROM } from "../packages/ui/src/tokens/supplement.ts";
import { hardCodedColors } from "./check-colors.ts";
import { pragmaProblems } from "./jsx-pragma.ts";

export type Rule =
  | "colour"
  | "size"
  | "font"
  | "global"
  | "inner-html"
  | "island-import"
  | "app-css"
  | "pragma"
  | "component"
  | "parse";

export interface Exception {
  /** A path from the repository root. */
  file: string;
  rule: Rule;
  reason: string;
}

/** Every allowed exception, in one place. */
export const EXCEPTIONS: readonly Exception[] = [
  {
    file: "packages/ui/src/runtime/Document.tsx",
    rule: "inner-html",
    reason:
      "the constant theme script, applied before first paint (ADR 0020, section 4); the one use the ADR allows",
  },
  {
    file: "packages/ui/src/runtime/theme.ts",
    rule: "global",
    reason:
      "THEME_SCRIPT is the text of that script, which runs in the browser before any island; it is a string here, not a call",
  },
  {
    file: "packages/ui/src/styles/checks.ts",
    rule: "size",
    reason:
      'the design rule "no type under 13px" names its limit in the message it reports; it checks the sheet and styles nothing',
  },
  {
    file: "packages/ui/src/styles/checks.ts",
    rule: "font",
    reason:
      "the tabular-figures rule quotes the `font` shorthand it found in the message it reports; it checks the sheet and styles nothing",
  },
  {
    file: "apps/web/src/core/icon.ts",
    rule: "app-css",
    reason:
      "the SVG icons carry their styles inside, since most are served as files of their own and cannot link ui.css (ADR 0020, section 4) until an Icon primitive exists",
  },
];

/** Widths a media or container query may name: the breakpoints the tokens list. */
export const BREAKPOINTS: readonly string[] = [TWO_COLUMNS_FROM];

/** The headings every `SPEC.md` has, in the order of `packages/ui/SPEC.md`. */
export const SPEC_HEADINGS = ["Purpose", "Design", "Props", "States", "Do not"] as const;

/** Where UI code lives: the site's source, and `@bd/ui` outside `tokens`. */
const UI = [/^apps\/web\/src\//, /^packages\/ui\/src\/(?!tokens\/)/];
const APP_SRC = /^apps\/[^/]+\/src\//;
const TEST = /\.test\.tsx?$/;
const CODE = /\.(ts|tsx)$/;
const COMPONENT = /^packages\/ui\/src\/(primitives|patterns)\/([^/]+)\/(.+)$/;

const SIZE = /(?<![\w.#-])-?\d*\.?\d+(?:px|rem)\b/g;
// `font-family` (or `fontFamily` in a style object) whose value is not a
// variable or a keyword names a font.
const FONT_FAMILY =
  /(?<![\w-])font-?family\b["']?\s*:\s*(?!\s*["'`]?\s*(?:var\(|inherit\b|initial\b|unset\b|revert\b))[^;}\n]*/gi;
// A `font` shorthand: it names a font when anything is left once variables,
// sizes, numbers and the shorthand's keywords are taken out (`fontNamed`).
const FONT_SHORTHAND = /(?<![\w-])font\s*:\s*([^;}\n]*)/gi;
const FONT_KEYWORDS =
  /\b(?:normal|italic|oblique|small-caps|bold|bolder|lighter|inherit|initial|unset|revert|caption|icon|menu|message-box|small-caption|status-bar|(?:ultra-|extra-|semi-)?(?:condensed|expanded))\b/gi;

// The absolute and relative size keywords a `font` shorthand may name.
const SIZE_KEYWORDS = /\b(?:xx?x?-small|xx?x?-large|small|medium|large|smaller|larger|math)\b/gi;

/** True when a `font` shorthand's value names a font. */
export function fontNamed(value: string): boolean {
  // Innermost functions first, so `var(--a, var(--b))` goes as a whole.
  let rest = value;
  for (let before = ""; before !== rest; ) {
    before = rest;
    rest = rest.replace(/[\w-]+\([^()]*\)/g, " ");
  }
  rest = rest
    .replace(/-?\d*\.?\d+[a-z%]*/gi, " ")
    // The keywords before the sizes, so `small-caps` is not read as `small`.
    .replace(FONT_KEYWORDS, " ")
    .replace(SIZE_KEYWORDS, " ")
    .replace(/["'`]\s*$|^\s*["'`]/g, " ")
    .replace(/[/,\s]/g, "");
  return rest !== "";
}

const GLOBAL =
  /(?<![\w.$])(?:document|window)\s*(?:\.|\?\.|\[)|\bglobalThis\.(?:document|window)\b/g;
const INNER_HTML = /\bdangerouslySetInnerHTML\b/g;
const STYLE_ATTR = /(?<![\w-])style\s*=|<style\b/g;
const CLASS_RULE = /(?<![\w$)\]])\.[A-Za-z][\w-]*\s*\{|@(?:media|layer|font-face|container)\b/g;
const QUERY = /@(?:media|container)\b/;
// A value import or re-export, a bare import, or a dynamic import of
// `@bd/contracts`; `import type` and `export type` are left out.
const CONTRACTS_VALUE =
  /\b(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s*["']@bd\/contracts(?:\/[^"']*)?["']|\bimport\s*\(?\s*["']@bd\/contracts/g;

/** A string in the source: its text, and the line its text starts on. */
export interface Piece {
  text: string;
  line: number;
  /** A style object's `font` or `fontFamily` entry, read as a declaration: only the font rules look at it. */
  fontOnly?: boolean;
}

export interface Read {
  /** The source with comments blanked, so line numbers and columns stay. */
  code: string;
  /** What may hold a style value: in code, every string, template literal and JSX attribute string; in a `.css` file, the whole sheet. */
  pieces: Piece[];
}

/** Babel node keys that are not children. */
const NOT_CHILDREN = new Set([
  "loc",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "extra",
]);

// A `${}` part of a template stands for a value the template does not know:
// read it as a variable, so `font: ${size} var(--font-sans)` names no font.
const HOLE = "var(--hole)";

/**
 * Reads a file for the style rules. Code is parsed with `@babel/parser`
 * (TypeScript, and JSX in `.tsx`), so a string is what the parser calls one:
 * JSX text, regular expressions and comments are not strings (#285). A
 * `.css` file keeps its text with the comments blanked.
 */
export function readSource(path: string, source: string): Read {
  const out = source.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k += 1) if (out[k] !== "\n") out[k] = " ";
  };
  if (path.endsWith(".css")) {
    for (const m of source.matchAll(/\/\*[\s\S]*?\*\//g)) blank(m.index, m.index + m[0].length);
    const code = out.join("");
    return { code, pieces: [{ text: code, line: 1 }] };
  }
  const ast = parse(source, {
    sourceType: "module",
    plugins: path.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"],
  });
  for (const c of ast.comments ?? []) blank(c.start ?? 0, c.end ?? 0);
  const pieces: Piece[] = [];
  const lineAt = (node: Node) => node.loc?.start.line ?? 1;
  // A string's text without its quotes; a template's, with each `${}` part
  // read as `HOLE` and the lines it spans kept, so later matches keep their line.
  const inner = (n: Node): string => {
    if (n.type !== "TemplateLiteral") return source.slice((n.start ?? 0) + 1, (n.end ?? 0) - 1);
    let text = "";
    n.quasis.forEach((q, i) => {
      text += q.value.raw;
      const next = n.quasis[i + 1];
      if (next === undefined) return;
      const hole = source.slice(q.end ?? 0, next.start ?? 0);
      text += HOLE + "\n".repeat(hole.split("\n").length - 1);
    });
    return text;
  };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    if (node === null || typeof node !== "object" || !("type" in node)) return;
    const n = node as Node;
    if (n.type === "StringLiteral") {
      pieces.push({ text: inner(n), line: lineAt(n) });
    } else if (n.type === "TemplateLiteral") {
      pieces.push({ text: inner(n), line: lineAt(n) });
    } else if (n.type === "ObjectProperty" && !n.computed) {
      // A style object's entry, `{ fontFamily: "Georgia" }` or `{ font: "..." }`,
      // read as the declaration it stands for.
      const key = n.key;
      const name =
        key.type === "Identifier" ? key.name : key.type === "StringLiteral" ? key.value : "";
      // `"Georgia" as const`, `satisfies`, `<const>"Georgia"` and `!` wrap
      // the value without changing it.
      let v: Node = n.value;
      while (
        v.type === "TSAsExpression" ||
        v.type === "TSSatisfiesExpression" ||
        v.type === "TSTypeAssertion" ||
        v.type === "TSNonNullExpression"
      ) {
        v = v.expression;
      }
      if (/^(?:font-?family|font)$/i.test(name)) {
        if (v.type === "StringLiteral" || v.type === "TemplateLiteral") {
          const q = source[v.start ?? 0] ?? '"';
          pieces.push({
            text: `${name}: ${q}${inner(v)}${q}`,
            line: lineAt(v),
            fontOnly: true,
          });
        }
      }
    }
    for (const [k, child] of Object.entries(n)) {
      if (!NOT_CHILDREN.has(k) && child !== null && typeof child === "object") visit(child);
    }
  };
  visit(ast.program);
  return { code: out.join(""), pieces };
}

const SKIP = new Set(["node_modules", ".git", "dist", ".wrangler", ".wrangler-dist", "public"]);

function walk(root: string, dir: string): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = dir === "" ? name : `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? walk(root, path) : [path];
  });
}

/**
 * The files to check, from the repository root: what git tracks or would
 * add (ignored build output such as `apps/web/public/client` is left out),
 * or, outside a repository, every file under `apps` and `packages`.
 */
export function listFiles(root: string): string[] {
  const git = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  if (git.status === 0 && existsSync(join(root, ".git"))) {
    return git.stdout
      .split("\n")
      .filter((p) => /^(apps|packages)\//.test(p) && existsSync(join(root, p)));
  }
  return [...walk(root, "apps"), ...walk(root, "packages")];
}

interface Found {
  file: string;
  line?: number | undefined;
  rule: Rule;
  message: string;
}

function scan(root: string, files: readonly string[]): Found[] {
  const found: Found[] = [];
  const add = (file: string, line: number | undefined, rule: Rule, message: string) =>
    found.push({ file, line, rule, message });

  for (const file of files) {
    if (TEST.test(file)) continue;
    const inUi = UI.some((r) => r.test(file));
    const inApp = APP_SRC.test(file);
    const isCss = file.endsWith(".css");
    const isCode = CODE.test(file);

    if (file.startsWith("apps/") && isCss) {
      add(file, undefined, "app-css", "a .css file in an app: styles live in @bd/ui");
    }
    if (!(inUi || inApp) || !(isCss || isCode)) continue;

    const text = readFileSync(join(root, file), "utf8");
    const lines = found.length;
    let read: Read;
    try {
      read = readSource(file, text);
    } catch (e) {
      const line = (e as { loc?: { line?: number } }).loc?.line;
      add(file, line, "parse", `could not be parsed: ${(e as Error).message}`);
      continue;
    }
    for (const piece of read.pieces) {
      piece.text.split("\n").forEach((line, i) => {
        const at = piece.line + i;
        if (inUi && !piece.fontOnly) {
          for (const m of line.matchAll(SIZE)) {
            if (QUERY.test(line) && BREAKPOINTS.includes(m[0])) continue;
            add(file, at, "size", `"${m[0]}" (use a size token from tokens.json)`);
          }
        }
        if (inUi) {
          for (const m of line.matchAll(FONT_FAMILY)) {
            add(file, at, "font", `"${m[0].trim()}" (use a font token)`);
          }
          for (const m of line.matchAll(FONT_SHORTHAND)) {
            if (!fontNamed(m[1] ?? "")) continue;
            add(file, at, "font", `"${m[0].trim()}" names a font (use a font token)`);
          }
        }
        if (inApp && isCode && !piece.fontOnly) {
          for (const m of line.matchAll(CLASS_RULE)) {
            add(file, at, "app-css", `"${m[0].trim()}" is CSS in an app: use a @bd/ui component`);
          }
        }
      });
    }
    if (isCode) {
      read.code.split("\n").forEach((line, i) => {
        const at = i + 1;
        if (!file.endsWith(".island.tsx")) {
          for (const m of line.matchAll(GLOBAL)) {
            add(
              file,
              at,
              "global",
              `"${m[0]}" outside an island (only *.island.tsx runs in the browser)`,
            );
          }
        }
        for (const _ of line.matchAll(INNER_HTML)) {
          add(file, at, "inner-html", "dangerouslySetInnerHTML outside Document");
        }
        if (inApp) {
          for (const m of line.matchAll(STYLE_ATTR)) {
            add(file, at, "app-css", `"${m[0]}" in an app: use a @bd/ui component`);
          }
        }
      });
    }

    // Strings and code are read in separate passes: put this file's line
    // findings back in line order (the sort is stable).
    found.splice(
      lines,
      found.length - lines,
      ...found.slice(lines).sort((a, b) => (a.line ?? 0) - (b.line ?? 0)),
    );

    if (file.startsWith("packages/ui/src/") && file.endsWith(".island.tsx")) {
      islandImports(file, text, add);
    }
  }
  return found;
}

const transpiler = new Bun.Transpiler({ loader: "tsx" });

function islandImports(
  file: string,
  text: string,
  add: (file: string, line: number | undefined, rule: Rule, message: string) => void,
) {
  for (const imp of transpiler.scanImports(text)) {
    if (/\.island(\.tsx?|\.js)?$/.test(imp.path)) {
      add(
        file,
        lineOf(text, imp.path),
        "island-import",
        `imports the island ${imp.path}: an island imports no island`,
      );
    }
  }
  for (const m of text.matchAll(CONTRACTS_VALUE)) {
    const line = text.slice(0, m.index).split("\n").length;
    add(
      file,
      line,
      "island-import",
      "imports a value from @bd/contracts: an island takes types only (import type)",
    );
  }
}

function lineOf(text: string, needle: string): number | undefined {
  const at = text.indexOf(needle);
  return at === -1 ? undefined : text.slice(0, at).split("\n").length;
}

/** Each component folder's states file and spec, and the spec's headings. */
function components(root: string, files: readonly string[]): Found[] {
  const folders = new Map<string, { layer: string; name: string; files: Set<string> }>();
  for (const f of files) {
    const m = COMPONENT.exec(f);
    if (m === null) continue;
    const [, layer, name, rest] = m as unknown as [string, string, string, string];
    const key = `${layer}/${name}`;
    const entry = folders.get(key) ?? { layer, name, files: new Set<string>() };
    entry.files.add(rest);
    folders.set(key, entry);
  }
  const found: Found[] = [];
  for (const { layer, name, files: inside } of folders.values()) {
    const dir = `packages/ui/src/${layer}/${name}`;
    if (!inside.has(`${name}.states.tsx`)) {
      found.push({
        file: dir,
        rule: "component",
        message: `no ${name}.states.tsx (ADR 0020, section 12)`,
      });
    }
    if (!inside.has("SPEC.md")) {
      found.push({
        file: dir,
        rule: "component",
        message: "no SPEC.md (template: packages/ui/SPEC.md)",
      });
      continue;
    }
    found.push(...specProblems(root, `${dir}/SPEC.md`, name));
  }
  return found;
}

/** A spec names its component, has the template's headings in order, and cites a design file that exists. */
export function specProblems(root: string, file: string, name: string): Found[] {
  const text = readFileSync(join(root, file), "utf8");
  const found: Found[] = [];
  const problem = (message: string) => found.push({ file, rule: "component", message });
  if (!text.startsWith(`# ${name}\n`)) problem(`the first line is not "# ${name}"`);
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => (m[1] ?? "").trim());
  const want = SPEC_HEADINGS.join(", ");
  if (headings.join(", ") !== want) {
    problem(`its sections are "${headings.join(", ")}", not "${want}" (packages/ui/SPEC.md)`);
  }
  const design = /^## Design\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? "";
  const cited = [...design.matchAll(/`(design\/[^`]+)`/g)].map((m) => m[1] ?? "");
  if (cited.length === 0) problem("its Design section cites no file under design/");
  for (const path of cited) {
    if (!existsSync(join(root, path)))
      problem(`its Design section cites ${path}, which does not exist`);
  }
  return found;
}

const format = (f: Found) =>
  `${f.file}${f.line === undefined ? "" : `:${f.line}`}: ${f.rule}: ${f.message}`;

/** Every problem, as `file:line: rule: message`. */
export function uiProblems(
  root: string,
  files: readonly string[] = listFiles(root),
  exceptions: readonly Exception[] = EXCEPTIONS,
): string[] {
  const found = [...scan(root, files), ...components(root, files)];
  const used = new Set<Exception>();
  const kept = found.filter((f) => {
    const e = exceptions.find((x) => x.file === f.file && x.rule === f.rule);
    if (e === undefined) return true;
    used.add(e);
    return false;
  });
  const out = kept.map(format);
  for (const c of hardCodedColors(root)) out.push(c.replace(/^([^:]+:\d+): /, "$1: colour: "));
  for (const p of pragmaProblems(root)) out.push(p.replace(/^([^:]+): /, "$1: pragma: "));
  for (const e of exceptions) {
    if (!used.has(e)) {
      out.push(
        `scripts/check-ui.ts: the exception for ${e.rule} in ${e.file} matches nothing: remove it`,
      );
    }
  }
  return out;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const found = uiProblems(root);
  for (const line of found) console.error(line);
  if (found.length > 0) process.exit(1);
  console.log(
    "check-ui: pages use Tide Paper tokens and components; every component has states and a spec",
  );
}
