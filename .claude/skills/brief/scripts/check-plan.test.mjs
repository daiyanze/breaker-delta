// Run with `node --test` (needs the `yaml` package) or `bun test`.
// One test per line under "It fails when" in check-plan.mjs, so the comment
// there claims nothing a test does not show.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadYaml, planProblems } from "./check-plan.mjs";

const parse = await loadYaml();
const script = fileURLToPath(new URL("./check-plan.mjs", import.meta.url));

/** A folder holding `docs/record.md`, which a sound plan points at. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "plan-"));
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs", "record.md"), "# Record\n");
  return dir;
}

const issue = (id, extra = "") =>
  `  - id: ${id}\n    title: Do ${id}\n    what: Build ${id}.\n    acceptance:\n      - a test for ${id} passes\n${extra}`;
const plan = (issues, top = "") => `goal: A goal\nrecord: docs/record.md\n${top}issues:\n${issues}`;

function problems(text) {
  return planProblems(parse(text), repo()).problems;
}

/** Each text gives a problem matching `pattern`, and no other. */
function fails(pattern, ...texts) {
  for (const text of texts) {
    const found = problems(text);
    assert.equal(found.length, 1, `${JSON.stringify(text)} gave ${JSON.stringify(found)}`);
    assert.match(found[0], pattern);
  }
}

test("a sound plan passes, and the order puts dependencies first", () => {
  const text = plan(
    issue("fill-in", '    depends_on: [types, "#12"]\n') +
      issue("types", "    milestone: M2\n") +
      issue("docs"),
  );
  assert.deepEqual(planProblems(parse(text), repo()), {
    problems: [],
    order: ["types", "fill-in", "docs"],
  });
});

test("a file that is not YAML, or not a mapping, fails", () => {
  const dir = repo();
  writeFileSync(join(dir, "bad.yaml"), "goal: [unclosed\n");
  const run = spawnSync(process.execPath, [script, "bad.yaml"], { cwd: dir, encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /not valid YAML/);
  for (const text of ["", "- a list\n", "just text\n"]) {
    assert.deepEqual(problems(text), ["the plan is not a mapping"]);
  }
});

test("an unknown key fails, at the top and in an issue", () => {
  fails(/unknown key "owner"/, plan(issue("a"), "owner: me\n"));
  fails(/a: unknown key "depends-on"/, plan(issue("a", "    depends-on: [b]\n") + issue("b")));
});

test("goal and record must be there, and record must be a file", () => {
  const issues = `issues:\n${issue("a")}`;
  fails(/goal is missing/, `record: docs/record.md\n${issues}`, `goal: " "\nrecord: docs/record.md\n${issues}`);
  fails(/record is missing/, `goal: A goal\n${issues}`, `goal: A goal\nrecord: ""\n${issues}`);
  fails(/record docs\/nowhere.md is not a file/, `goal: A goal\nrecord: docs/nowhere.md\n${issues}`);
  fails(/record docs is not a file/, `goal: A goal\nrecord: docs\n${issues}`);
});

test("issues must be a list with something in it, of mappings", () => {
  const top = "goal: A goal\nrecord: docs/record.md\n";
  fails(/issues is missing/, top, `${top}issues: []\n`, `${top}issues: some\n`);
  fails(/issue 2 is not a mapping/, `${top}issues:\n${issue("a")}  - just text\n`);
});

test("an id must be there, well formed, and used once", () => {
  fails(/issue 1: id is missing/, plan("  - title: T\n    what: W\n    acceptance: [x]\n"));
  fails(/Bad_Id: id must be lowercase/, plan(issue("Bad_Id")));
  fails(/issue 1: id must be lowercase/, plan(issue("5")));
  fails(/a: id is used twice/, plan(issue("a") + issue("a")));
});

test("title, what and milestone are checked", () => {
  fails(/a: title is missing/, plan("  - id: a\n    what: W\n    acceptance: [x]\n"));
  fails(/a: title is missing/, plan('  - id: a\n    title: ""\n    what: W\n    acceptance: [x]\n'));
  fails(/a: title is over 256/, plan(`  - id: a\n    title: ${"t".repeat(257)}\n    what: W\n    acceptance: [x]\n`));
  fails(/a: what is missing/, plan("  - id: a\n    title: T\n    acceptance: [x]\n"));
  fails(/a: milestone must be text/, plan(issue("a", "    milestone: 2\n")), plan(issue("a", "    milestone: ''\n")));
});

test("acceptance must be a list of text", () => {
  fails(/a: acceptance is missing/, plan("  - id: a\n    title: T\n    what: W\n"));
  fails(/a: acceptance is missing/, plan("  - id: a\n    title: T\n    what: W\n    acceptance: []\n"));
  fails(/a: acceptance is missing/, plan("  - id: a\n    title: T\n    what: W\n    acceptance: it works\n"));
  fails(/a: every acceptance item/, plan("  - id: a\n    title: T\n    what: W\n    acceptance: [ok, '']\n"));
  fails(/a: every acceptance item/, plan("  - id: a\n    title: T\n    what: W\n    acceptance: [ok, 3]\n"));
  fails(/a: an acceptance item reads as a mapping/, plan("  - id: a\n    title: T\n    what: W\n    acceptance:\n      - Check: it runs\n"));
  assert.deepEqual(problems(plan("  - id: a\n    title: T\n    what: W\n    acceptance:\n      - 'Check: it runs'\n")), []);
});

test("depends_on names ids in the plan or quoted issue numbers, with no loops", () => {
  fails(/a: depends_on must be a list/, plan(issue("a", "    depends_on: b\n") + issue("b")));
  fails(/a: depends_on must be a list/, plan(issue("a", "    depends_on:\n")));
  fails(/a: depends_on "nowhere" is neither/, plan(issue("a", "    depends_on: [nowhere]\n")));
  fails(/a: depends_on "#0" is neither/, plan(issue("a", '    depends_on: ["#0"]\n')));
  fails(/write an issue number as "#12", quoted/, plan(issue("a", "    depends_on: [12]\n")));
  fails(/a: depends on itself/, plan(issue("a", "    depends_on: [a]\n")));
  fails(
    /cycle: a -> b -> c -> a/,
    plan(issue("a", "    depends_on: [b]\n") + issue("b", "    depends_on: [c]\n") + issue("c", "    depends_on: [a]\n")),
  );
});

test("the yaml package is the parser when it is installed", async (t) => {
  const installed = await import("yaml").then(
    () => true,
    () => false,
  );
  if (!installed) return t.skip("the yaml package is not installed");
  // Bun's own parser keeps one of two repeated keys; `yaml` refuses the file.
  assert.throws(() => parse("goal: a\ngoal: b\n"));
});

test("the command line: ok and the order, problems, and usage", () => {
  const dir = repo();
  writeFileSync(join(dir, "plan.yaml"), plan(issue("b", "    depends_on: [a]\n") + issue("a")));
  writeFileSync(join(dir, "broken.yaml"), plan(issue("a", "    depends_on: [a]\n")));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: "utf8" });

  const ok = run("plan.yaml");
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), "plan ok: create in this order: a, b");

  const broken = run("broken.yaml");
  assert.equal(broken.status, 1);
  assert.equal(broken.stderr.trim(), "plan: a: depends on itself");

  for (const args of [[], ["plan.yaml", "broken.yaml"], ["--help"], ["missing.yaml"]]) {
    assert.equal(run(...args).status, 2, JSON.stringify(args));
  }
});
