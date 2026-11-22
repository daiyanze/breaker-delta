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

// Lessons L7 and L14: a violation in every place the check claims to cover,
// including frontmatter a YAML parser rejects or reads as empty.
test("each kind of broken skill is reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "bd-skills-"));
  const ok = "description: Does a thing.";
  skill(dir, "good", `---\nname: good\n${ok}\n---\n\n# Good\n`);
  skill(dir, "crlf", `---\r\nname: crlf\r\n${ok}\r\n---\r\n`);
  skill(dir, "quoted", `---\nname: "quoted"\n${ok}\n---\n`);
  symlinkSync(join(dir, "good"), join(dir, "linked"));
  symlinkSync(join(dir, "nowhere"), join(dir, "dangling"));

  const broken: Record<string, string | null> = {
    "no-file": null,
    "no-frontmatter": "# Just a heading\n",
    "wrong-name": `---\nname: other\n${ok}\n---\n`,
    "no-description": "---\nname: no-description\n---\n",
    "bare-description": "---\nname: bare-description\ndescription:\n---\n",
    "empty-string": '---\nname: empty-string\ndescription: ""\n---\n',
    "folded-empty": "---\nname: folded-empty\ndescription: >\n---\n",
    "comment-only": "---\nname: comment-only\ndescription: # todo\n---\n",
    "a-list": "---\nname: a-list\ndescription: [a, b]\n---\n",
    "second-colon": "---\nname: second-colon\ndescription: Use when: asked.\n---\n",
    "tab-indent": `---\nname: tab-indent\n${ok}\nmetadata:\n\tkey: value\n---\n`,
    "not-a-mapping": "---\n- name\n- description\n---\n",
    long: `---\nname: long\ndescription: ${"x".repeat(1025)}\n---\n`,
    Bad_Name: `---\nname: Bad_Name\n${ok}\n---\n`,
    run: `---\nname: run\n${ok}\n---\n`,
  };
  for (const [name, content] of Object.entries(broken)) skill(dir, name, content);

  const problems = skillProblems(dir);
  const about = (name: string) => problems.filter((p) => p.startsWith(`${name}:`));
  expect(about("good")).toEqual([]);
  expect(about("crlf")).toEqual([]);
  expect(about("quoted")).toEqual([]);
  // A linked skill is checked like any other: its name is "good", not "linked".
  expect(about("linked").length).toBe(1);
  expect(about("dangling")).toEqual(["dangling: broken link"]);
  for (const name of Object.keys(broken)) {
    expect({ name, problems: about(name).length }).toEqual({ name, problems: 1 });
  }
});

test("each kind of broken wiring is reported", () => {
  const empty = mkdtempSync(join(tmpdir(), "bd-wiring-"));
  expect(wiringProblems(empty)).toContain("AGENTS.md is missing");
  expect(wiringProblems(empty)).toContain("CLAUDE.md must start with the line @AGENTS.md");

  const copy = mkdtempSync(join(tmpdir(), "bd-wiring-"));
  writeFileSync(join(copy, "AGENTS.md"), "# Rules\n");
  mkdirSync(join(copy, ".claude", "skills"), { recursive: true });
  mkdirSync(join(copy, ".agents"), { recursive: true });
  mkdirSync(join(copy, "elsewhere"));
  const onlyImport = "CLAUDE.md must only import AGENTS.md: put rules in AGENTS.md";

  writeFileSync(join(copy, "CLAUDE.md"), "# Rules, copied instead of imported\n");
  expect(wiringProblems(copy)).toContain("CLAUDE.md must start with the line @AGENTS.md");
  writeFileSync(join(copy, "CLAUDE.md"), "@AGENTS.md\n\n# Rules\n\nA second copy.\n");
  expect(wiringProblems(copy)).toContain(onlyImport);
  writeFileSync(join(copy, "CLAUDE.md"), `@AGENTS.md\n${"A rule.\n".repeat(6)}`);
  expect(wiringProblems(copy)).toContain(onlyImport);
  writeFileSync(join(copy, "CLAUDE.md"), "@AGENTS.md\n\nThe rules are in AGENTS.md.\n");
  expect(wiringProblems(copy)).not.toContain(onlyImport);

  writeFileSync(join(copy, "AGENTS.override.md"), "# Other rules\n");
  expect(wiringProblems(copy)).toContain(
    "AGENTS.override.md outranks AGENTS.md in Pi and Codex: remove it",
  );

  if (process.platform === "win32") return;
  expect(wiringProblems(copy)).toContain(".agents/skills is missing or a broken link");
  symlinkSync(join(copy, "elsewhere"), join(copy, ".agents", "skills"));
  expect(wiringProblems(copy)).toContain(".agents/skills must resolve to .claude/skills");
});
