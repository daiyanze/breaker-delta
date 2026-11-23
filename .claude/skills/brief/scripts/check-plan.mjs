#!/usr/bin/env node
/**
 * Is a plan of issues, as the brief skill writes it, well formed?
 *
 *   node check-plan.mjs <plan.yaml>
 *
 * Paths in the plan are read from the current folder: run it from the
 * repository root. Prints one line per problem and exits 1 if there is any.
 * Otherwise prints `plan ok` and the order to create the issues in,
 * dependencies first, and exits 0. Exits 2 when it cannot run (no file or more
 * than one, an unreadable file, no YAML parser).
 *
 * This comment is the one place that says what the check covers. Other
 * documents point here instead of repeating it. Every line under "It fails
 * when" has a test in check-plan.test.mjs.
 *
 * It fails when:
 * - the file is not valid YAML, or is not a mapping;
 * - a key at the top or in an issue is not one this check knows (a typo such
 *   as `depends-on` would otherwise read as "no dependencies");
 * - `goal` is missing or empty; `record` is missing, empty, or not a file;
 * - `issues` is missing, not a list, or empty; an issue is not a mapping;
 * - an issue's `id` is missing, not lowercase words joined by "-", or used
 *   twice; its `title` is missing, empty or over 256 characters (GitHub's
 *   limit); its `what` is missing or empty; its `milestone`, when given, is
 *   not text;
 * - an issue's `acceptance` is missing, not a list, empty, or holds an item
 *   that is not text or is empty (an unquoted item holding ": " is read as a
 *   mapping, and is named as such);
 * - an issue's `depends_on`, when given (an empty `depends_on:` counts), is
 *   not a list, or holds an entry that is neither an id in this plan nor an
 *   issue number written "#123"; an issue depends on itself; or the
 *   dependencies form a cycle.
 *
 * It does not see:
 * - whether an issue is one concern that one pull request can land;
 * - whether an acceptance criterion is really a check;
 * - whether the dependencies are the real ones, or more than are needed;
 * - GitHub: whether a "#123" issue or a milestone exists;
 * - whether the record says what the plan builds on;
 * - a key repeated inside one mapping, when it runs on Bun without the `yaml`
 *   package: Bun's parser keeps one of the two. `yaml` refuses the file, and
 *   is preferred when installed; on Node it is required (`npm i -D yaml`).
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISSUE_NUMBER = /^#[1-9][0-9]*$/;
const TOP_KEYS = ["goal", "record", "issues"];
const ISSUE_KEYS = ["id", "title", "milestone", "depends_on", "what", "acceptance"];

/** A YAML parse function: the `yaml` package if installed, otherwise Bun's own. */
export async function loadYaml() {
  try {
    return (await import("yaml")).parse;
  } catch {
    if (typeof Bun !== "undefined" && Bun.YAML) return (text) => Bun.YAML.parse(text);
    throw new Error('no YAML parser: run this with Bun, or add the "yaml" package (npm i -D yaml)');
  }
}

const isText = (value) => typeof value === "string" && value.trim() !== "";
const isMapping = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Problems with a parsed plan, one line each, and the order to create its
 * issues in (empty when there are problems). `root` is where `record` is read
 * from.
 */
export function planProblems(plan, root = ".") {
  const problems = [];
  if (!isMapping(plan)) return { problems: ["the plan is not a mapping"], order: [] };

  for (const key of Object.keys(plan)) {
    if (!TOP_KEYS.includes(key)) problems.push(`unknown key "${key}"`);
  }
  if (!isText(plan.goal)) problems.push("goal is missing or empty");
  if (!isText(plan.record)) problems.push("record is missing or empty");
  else if (!isFile(resolve(root, plan.record))) problems.push(`record ${plan.record} is not a file`);

  const issues = plan.issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    problems.push("issues is missing, not a list, or empty");
    return { problems, order: [] };
  }

  // The first issue with each id; a repeat is a problem and is left out.
  const byId = new Map();
  issues.forEach((issue, at) => {
    const where = `issue ${at + 1}`;
    if (!isMapping(issue)) {
      problems.push(`${where} is not a mapping`);
      return;
    }
    const name = typeof issue.id === "string" && issue.id.trim() !== "" ? issue.id : where;
    for (const key of Object.keys(issue)) {
      if (!ISSUE_KEYS.includes(key)) problems.push(`${name}: unknown key "${key}"`);
    }
    if (issue.id === undefined || issue.id === null || issue.id === "") problems.push(`${where}: id is missing`);
    else if (typeof issue.id !== "string" || !ID.test(issue.id)) {
      problems.push(`${name}: id must be lowercase words joined by "-"`);
    }
    else if (byId.has(issue.id)) problems.push(`${name}: id is used twice`);
    else byId.set(issue.id, issue);

    if (!isText(issue.title)) problems.push(`${name}: title is missing or empty`);
    else if (issue.title.length > 256) problems.push(`${name}: title is over 256 characters`);
    if (!isText(issue.what)) problems.push(`${name}: what is missing or empty`);
    if (issue.milestone !== undefined && !isText(issue.milestone)) {
      problems.push(`${name}: milestone must be text`);
    }

    const acceptance = issue.acceptance;
    if (!Array.isArray(acceptance) || acceptance.length === 0) {
      problems.push(`${name}: acceptance is missing, not a list, or empty`);
    } else if (acceptance.some(isMapping)) {
      problems.push(`${name}: an acceptance item reads as a mapping: quote an item that holds ": "`);
    } else if (!acceptance.every(isText)) {
      problems.push(`${name}: every acceptance item must be text, and not empty`);
    }
  });

  // Dependencies inside the plan, as edges from an issue to what it needs.
  const needs = new Map();
  for (const [id, issue] of byId) {
    const deps = issue.depends_on === undefined ? [] : issue.depends_on;
    needs.set(id, []);
    if (!Array.isArray(deps)) {
      problems.push(`${id}: depends_on must be a list`);
      continue;
    }
    for (const dep of deps) {
      if (dep === id) problems.push(`${id}: depends on itself`);
      else if (typeof dep === "string" && byId.has(dep)) needs.get(id).push(dep);
      else if (typeof dep === "string" && ISSUE_NUMBER.test(dep)) continue;
      else if (typeof dep === "number") {
        problems.push(`${id}: depends_on ${dep}: write an issue number as "#${dep}", quoted`);
      } else {
        problems.push(`${id}: depends_on ${JSON.stringify(dep)} is neither an id in this plan nor "#123"`);
      }
    }
  }

  for (const cycle of cycles(needs)) problems.push(`dependencies form a cycle: ${cycle.join(" -> ")}`);

  return { problems, order: problems.length === 0 ? createOrder(needs) : [] };
}

/** Each cycle in the graph once, as a path that ends where it starts. */
function cycles(needs) {
  const found = [];
  const state = new Map(); // id -> "open" while on the path, "done" after
  const path = [];
  const visit = (id) => {
    state.set(id, "open");
    path.push(id);
    for (const dep of needs.get(id)) {
      if (state.get(dep) === "open") found.push([...path.slice(path.indexOf(dep)), dep]);
      else if (!state.has(dep)) visit(dep);
    }
    path.pop();
    state.set(id, "done");
  };
  for (const id of needs.keys()) if (!state.has(id)) visit(id);
  return found;
}

/**
 * Dependencies first; among issues that are ready, the plan's own order.
 * Stops when nothing more is ready, so a cycle cannot make it loop.
 */
function createOrder(needs) {
  const order = [];
  const placed = new Set();
  for (;;) {
    const ready = [...needs].find(([id, deps]) => !placed.has(id) && deps.every((dep) => placed.has(dep)));
    if (!ready) return order;
    order.push(ready[0]);
    placed.add(ready[0]);
  }
}

/** Checks the plan named in `args`. Returns the exit code. */
export async function main(args) {
  if (args.length !== 1 || args[0].startsWith("-")) {
    console.error("plan: usage: check-plan.mjs <plan.yaml>");
    return 2;
  }
  let text;
  try {
    text = readFileSync(args[0], "utf8");
  } catch {
    console.error(`plan: cannot read ${args[0]}`);
    return 2;
  }
  const parse = await loadYaml();
  let plan;
  try {
    plan = parse(text);
  } catch (err) {
    const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.error(`plan: not valid YAML (${why})`);
    return 1;
  }
  const { problems, order } = planProblems(plan, process.cwd());
  for (const problem of problems) console.error(`plan: ${problem}`);
  if (problems.length > 0) return 1;
  console.log(`plan ok: create in this order: ${order.join(", ")}`);
  return 0;
}

/** True when this file is the program being run, also when reached through a link. */
function isProgram() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isProgram()) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (err) {
    console.error(`plan: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}
