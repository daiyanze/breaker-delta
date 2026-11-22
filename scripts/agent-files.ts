/**
 * Checks that every agent runtime finds the same rules and skills (ADR 0016):
 * `CLAUDE.md` imports `AGENTS.md`, `.agents/skills` resolves to
 * `.claude/skills`, and each skill has the frontmatter the runtimes need.
 * Pi does not load a skill without a description; the Agent Skills format
 * wants the name to match the folder.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A single-line `key: value` from the frontmatter block, or null. */
function field(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  return match?.[1]?.trim() || null;
}

/** Problems with the skills under `skillsDir`, one line each. Empty means fine. */
export function skillProblems(skillsDir: string): string[] {
  const problems: string[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(file)) {
      problems.push(`${entry.name}: no SKILL.md`);
      continue;
    }
    const frontmatter = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---\n/)?.[1];
    if (frontmatter === undefined) {
      problems.push(`${entry.name}: SKILL.md does not start with frontmatter`);
      continue;
    }
    const name = field(frontmatter, "name");
    if (name !== entry.name) {
      problems.push(`${entry.name}: name is ${JSON.stringify(name)}, must match the folder`);
    }
    if (!NAME.test(entry.name) || entry.name.length > 64) {
      problems.push(`${entry.name}: name must be lowercase words joined by "-", 64 chars at most`);
    }
    const description = field(frontmatter, "description");
    if (description === null) {
      problems.push(`${entry.name}: no description, so Pi will not load it`);
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
  const claude = existsSync(join(root, "CLAUDE.md"))
    ? readFileSync(join(root, "CLAUDE.md"), "utf8")
    : "";
  if (claude.split("\n")[0]?.trim() !== "@AGENTS.md") {
    problems.push("CLAUDE.md must start with the line @AGENTS.md");
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
