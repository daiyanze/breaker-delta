import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skillProblems, wiringProblems } from "./agent-files.ts";

const root = join(import.meta.dir, "..");

test("this repository's rules and skills are wired for every runtime", () => {
  expect(wiringProblems(root)).toEqual([]);
  expect(skillProblems(join(root, ".claude", "skills"))).toEqual([]);
});

function skill(dir: string, name: string, content: string | null) {
  mkdirSync(join(dir, name), { recursive: true });
  if (content !== null) writeFileSync(join(dir, name, "SKILL.md"), content);
}

// Lesson L7: put a violation in every place the check claims to cover.
test("each kind of broken skill is reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "bd-skills-"));
  skill(dir, "good", "---\nname: good\ndescription: Does a thing.\n---\n\n# Good\n");
  skill(dir, "no-file", null);
  skill(dir, "no-frontmatter", "# Just a heading\n");
  skill(dir, "wrong-name", "---\nname: other\ndescription: Does a thing.\n---\n");
  skill(dir, "no-description", "---\nname: no-description\n---\n");
  skill(dir, "empty-description", "---\nname: empty-description\ndescription:\n---\n");
  skill(dir, "long", `---\nname: long\ndescription: ${"x".repeat(1025)}\n---\n`);
  skill(dir, "Bad_Name", "---\nname: Bad_Name\ndescription: Does a thing.\n---\n");

  const problems = skillProblems(dir);
  const about = (name: string) => problems.filter((p) => p.startsWith(`${name}:`));
  expect(about("good")).toEqual([]);
  expect(about("no-file")).toEqual(["no-file: no SKILL.md"]);
  expect(about("no-frontmatter").length).toBe(1);
  expect(about("wrong-name").length).toBe(1);
  expect(about("no-description").length).toBe(1);
  expect(about("empty-description").length).toBe(1);
  expect(about("long").length).toBe(1);
  expect(about("Bad_Name").length).toBe(1);
});

test("each kind of broken wiring is reported", () => {
  const empty = mkdtempSync(join(tmpdir(), "bd-wiring-"));
  expect(wiringProblems(empty)).toContain("AGENTS.md is missing");
  expect(wiringProblems(empty)).toContain("CLAUDE.md must start with the line @AGENTS.md");

  const copy = mkdtempSync(join(tmpdir(), "bd-wiring-"));
  writeFileSync(join(copy, "AGENTS.md"), "# Rules\n");
  writeFileSync(join(copy, "CLAUDE.md"), "# Rules, copied instead of imported\n");
  mkdirSync(join(copy, ".claude", "skills"), { recursive: true });
  mkdirSync(join(copy, ".agents"), { recursive: true });
  mkdirSync(join(copy, "elsewhere"));
  expect(wiringProblems(copy)).toContain("CLAUDE.md must start with the line @AGENTS.md");
  if (process.platform === "win32") return;
  expect(wiringProblems(copy)).toContain(".agents/skills is missing or a broken link");
  symlinkSync(join(copy, "elsewhere"), join(copy, ".agents", "skills"));
  expect(wiringProblems(copy)).toContain(".agents/skills must resolve to .claude/skills");
});
