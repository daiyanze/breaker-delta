/**
 * Checks that every agent runtime finds the same rules and skills (ADR 0016):
 * `CLAUDE.md` only imports `AGENTS.md`, nothing outranks `AGENTS.md`,
 * `.agents/skills` resolves to `.claude/skills`, and each skill has the
 * frontmatter the runtimes need. Pi does not load a skill without a
 * description; the Agent Skills format wants the name to match the folder.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/**
 * Names a runtime already uses. Claude Code ships `run` and `code-review`
 * (also called as `/review`); a project skill with one of these names can be
 * left out of the model's list or replaced there by the bundled one
 * (lesson L14).
 */
const RESERVED = ["run", "review", "code-review"];

/** The frontmatter of a SKILL.md as a mapping, or what is wrong with it. */
function frontmatter(text: string): Record<string, unknown> | string {
  const block = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---(\n|$)/)?.[1];
  if (block === undefined) return "SKILL.md does not start with frontmatter";
  let parsed: unknown;
  try {
    // The runtimes read this block with a YAML parser, so the check does too.
    parsed = Bun.YAML.parse(block);
  } catch (err) {
    return `frontmatter is not valid YAML (${err instanceof Error ? err.message : String(err)})`;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "frontmatter is not a mapping";
  }
  return parsed as Record<string, unknown>;
}

/** True for a folder, and for a link to one: the runtimes follow links. */
function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Problems with the skills under `skillsDir`, one line each. Empty means fine. */
export function skillProblems(skillsDir: string): string[] {
  const problems: string[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    const folder = join(skillsDir, entry.name);
    if (entry.isSymbolicLink() && !existsSync(folder)) {
      problems.push(`${entry.name}: broken link`);
      continue;
    }
    if (!isFolder(folder)) continue;
    const file = join(folder, "SKILL.md");
    if (!existsSync(file)) {
      problems.push(`${entry.name}: no SKILL.md`);
      continue;
    }
    const fields = frontmatter(readFileSync(file, "utf8"));
    if (typeof fields === "string") {
      problems.push(`${entry.name}: ${fields}`);
      continue;
    }
    if (fields.name !== entry.name) {
      problems.push(`${entry.name}: name is ${JSON.stringify(fields.name)}, must match the folder`);
    }
    if (!NAME.test(entry.name) || entry.name.length > 64) {
      problems.push(`${entry.name}: name must be lowercase words joined by "-", 64 chars at most`);
    }
    if (RESERVED.includes(entry.name)) {
      problems.push(`${entry.name}: a runtime already ships a skill with this name`);
    }
    const description = fields.description;
    if (typeof description !== "string" || description.trim() === "") {
      problems.push(`${entry.name}: no description text, so Pi will not load it`);
    } else if (description.length > 1024) {
      problems.push(`${entry.name}: description is over 1024 characters`);
    }
  }
  return problems;
}

/** Problems with how the rules and skills are wired at `root`. */
export function wiringProblems(root: string): string[] {
  const problems: string[] = [];
  if (!existsSync(join(root, "AGENTS.md"))) problems.push("AGENTS.md is missing");
  if (existsSync(join(root, "AGENTS.override.md"))) {
    problems.push("AGENTS.override.md outranks AGENTS.md in Pi and Codex: remove it");
  }
  const claude = existsSync(join(root, "CLAUDE.md"))
    ? readFileSync(join(root, "CLAUDE.md"), "utf8")
    : "";
  const lines = claude.split("\n").filter((line) => line.trim() !== "");
  if (lines[0]?.trim() !== "@AGENTS.md") {
    problems.push("CLAUDE.md must start with the line @AGENTS.md");
  }
  // The import and a sentence saying so. More than that is a second copy.
  if (lines.length > 5 || lines.some((line) => line.startsWith("#"))) {
    problems.push("CLAUDE.md must only import AGENTS.md: put rules in AGENTS.md");
  }
  const real = join(root, ".claude", "skills");
  const link = join(root, ".agents", "skills");
  // A Windows clone without symlinks checks the link out as a plain file.
  if (process.platform !== "win32") {
    if (!existsSync(link)) {
      problems.push(".agents/skills is missing or a broken link");
    } else if (realpathSync(link) !== realpathSync(real)) {
      problems.push(".agents/skills must resolve to .claude/skills");
    }
  }
  return problems;
}
