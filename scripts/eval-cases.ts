/**
 * The eval case format (#50). One case is one JSON file under
 * `<dir>/<task>/<id>.json`, the input of one model call exactly as the
 * pipeline's step builds it (`AssignInput`, `SummarizeInput` from
 * `@bd/judge`), its origin, and, for assign, the owner's labels:
 *
 *   { "synthetic": true, "input": { ... }, "labels": { "<echo id>": "<topic id>" | "new" } }
 *   { "frozenFrom": "<slot>", "input": { ... } }
 *
 * Every case says where it came from: `synthetic: true` (written by hand,
 * no fetched text) or `frozenFrom` (made by `freeze-cases` from a stored
 * run, so it holds fetched titles and excerpts).
 *
 * - **Only synthetic cases are committed** (`evals/cases/`, owner, #253):
 *   fetched text must never reach a session that can write code (invariant
 *   6), and a review reads the diff. `loadCases(..., { committed: true })`
 *   refuses a frozen case, and the test over `evals/cases/` runs it.
 * - **A synthetic case's strings are value-checked:** one that looks like a
 *   URL, an email or a key (`sk-...`, `ghp_...`, a JWT, `Bearer ...`) is
 *   refused. A frozen case is not: real titles hold URLs, and it stays in a
 *   git-ignored folder on the owner's machine.
 * - **Keys are strict:** a key the format does not name is refused, at any
 *   depth, so a case holds no URL field, source name or other row data.
 *
 * Errors name the file and the path, never the value.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { LanguageSchema } from "../packages/contracts/src/index.ts";
import type {
  AssignInput,
  DriverEcho,
  DriverTopic,
  SummarizeInput,
} from "../packages/judge/src/index.ts";

export const TASKS = ["assign", "summarize"] as const;
export type Task = (typeof TASKS)[number];

export interface AssignCase {
  id: string;
  /** Written by hand, with no fetched text. Exactly one of this and `frozenFrom`. */
  synthetic?: true;
  /** The slot it was frozen from, when it was. */
  frozenFrom?: string;
  input: AssignInput;
  /**
   * The owner's assignment for some of the echoes: a shortlisted topic id,
   * or `new` for a new topic. Written by hand, never by `freeze-cases`.
   */
  labels?: Record<string, string>;
}

export interface SummarizeCase {
  id: string;
  synthetic?: true;
  frozenFrom?: string;
  input: SummarizeInput;
}

export interface Cases {
  assign: AssignCase[];
  summarize: SummarizeCase[];
}

/** A case file that does not fit the format. The message names the file and the path. */
export class CaseError extends Error {
  constructor(file: string, path: string, problem: string) {
    super(`${file}: ${path || "(root)"}: ${problem}`);
    this.name = "CaseError";
  }
}

/** Where committed cases live. Synthetic only. */
export const COMMITTED_CASES = join(import.meta.dir, "..", "evals", "cases");

/**
 * Strings a synthetic case must not hold: a URL (a scheme or `www.`), an
 * email address, or a key or token shape (OpenAI-style `sk-`, Groq `gsk_`,
 * Google `AIza`, GitHub `ghp_` and kin, Slack `xox?-`, AWS `AKIA`,
 * Cloudflare `cfat_`, a JWT, a bearer header).
 */
const UNSAFE = [
  /\p{L}[\p{L}\p{N}+.-]*:\/\/|(?:^|[^\p{L}\p{N}])www\./iu,
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u,
  /(?:^|[^A-Za-z0-9])(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/,
  /\b(?:gsk_|cfat_)[A-Za-z0-9_]{8,}/,
  /\bAIza[0-9A-Za-z_-]{20,}/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,})/,
  /\bxox[abprs]-[A-Za-z0-9-]{8,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\bBearer\s+\S{8,}/i,
];

/** A case id is its file name: letters, digits, `.`, `_` and `-`. */
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type Fail = (path: string, problem: string) => never;

function record(v: unknown, path: string, keys: readonly string[], fail: Fail) {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "must be an object");
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (!keys.includes(k)) fail(path ? `${path}.${k}` : k, "is not part of the case format");
  }
  return o;
}

/** The current case's rule for strings; set per case by `parseCase`. */
let checkValues = false;

function text(v: unknown, path: string, fail: Fail): string {
  if (typeof v !== "string" || v.trim() === "") fail(path, "must be a non-empty string");
  const s = v as string;
  if (checkValues && UNSAFE.some((re) => re.test(s))) {
    fail(path, "looks like a URL, an email or a key; a synthetic case holds none");
  }
  return s;
}

function list(v: unknown, path: string, fail: Fail): unknown[] {
  if (!Array.isArray(v)) fail(path, "must be an array");
  return v as unknown[];
}

function echo(v: unknown, path: string, fail: Fail): DriverEcho {
  const o = record(v, path, ["id", "title", "summary"], fail);
  const e: DriverEcho = {
    id: text(o.id, `${path}.id`, fail),
    title: text(o.title, `${path}.title`, fail),
  };
  if (o.summary !== undefined) e.summary = text(o.summary, `${path}.summary`, fail);
  return e;
}

function topic(v: unknown, path: string, fail: Fail): DriverTopic {
  const o = record(v, path, ["id", "name", "aliases"], fail);
  const t: DriverTopic = {
    id: text(o.id, `${path}.id`, fail),
    name: text(o.name, `${path}.name`, fail),
  };
  if (o.aliases !== undefined) {
    t.aliases = list(o.aliases, `${path}.aliases`, fail).map((a, i) =>
      text(a, `${path}.aliases.${i}`, fail),
    );
  }
  return t;
}

function unique(ids: readonly string[], path: string, fail: Fail) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(path, `id ${id} appears twice`);
    seen.add(id);
  }
}

/** One case of `task` from its parsed JSON; throws `CaseError`. */
export function parseCase(task: "assign", id: string, json: unknown, file?: string): AssignCase;
export function parseCase(
  task: "summarize",
  id: string,
  json: unknown,
  file?: string,
): SummarizeCase;
export function parseCase(
  task: Task,
  id: string,
  json: unknown,
  file?: string,
): AssignCase | SummarizeCase;
export function parseCase(
  task: Task,
  id: string,
  json: unknown,
  file = `${task}/${id}.json`,
): AssignCase | SummarizeCase {
  const fail: Fail = (path, problem) => {
    throw new CaseError(file, path, problem);
  };
  if (!ID.test(id)) fail("", `case id ${JSON.stringify(id)} must match ${ID}`);
  const root = record(json, "", ["synthetic", "frozenFrom", "input", "labels"], fail);
  const synthetic = root.synthetic === true;
  if (
    synthetic === (root.frozenFrom !== undefined) ||
    (root.synthetic !== undefined && !synthetic)
  ) {
    fail("", "must have exactly one of synthetic: true or frozenFrom");
  }
  checkValues = synthetic;
  try {
    return parseBody(task, id, root, synthetic, fail);
  } finally {
    checkValues = false;
  }
}

function parseBody(
  task: Task,
  id: string,
  root: Record<string, unknown>,
  synthetic: boolean,
  fail: Fail,
): AssignCase | SummarizeCase {
  const frozenFrom = synthetic
    ? { synthetic: true as const }
    : { frozenFrom: text(root.frozenFrom, "frozenFrom", fail) };

  if (task === "assign") {
    if (root.input === undefined) fail("input", "is required");
    const o = record(root.input, "input", ["echoes", "topics"], fail);
    const echoes = list(o.echoes, "input.echoes", fail).map((e, i) =>
      echo(e, `input.echoes.${i}`, fail),
    );
    if (echoes.length === 0) fail("input.echoes", "must have at least one echo");
    const topics = list(o.topics, "input.topics", fail).map((t, i) =>
      topic(t, `input.topics.${i}`, fail),
    );
    unique(
      echoes.map((e) => e.id),
      "input.echoes",
      fail,
    );
    unique(
      topics.map((t) => t.id),
      "input.topics",
      fail,
    );
    const out: AssignCase = { id, ...frozenFrom, input: { echoes, topics } };
    if (root.labels !== undefined) {
      const echoIds = new Set(echoes.map((e) => e.id));
      const topicIds = new Set(topics.map((t) => t.id));
      const labels = record(root.labels, "labels", [...echoIds], fail);
      out.labels = {};
      for (const [echoId, label] of Object.entries(labels)) {
        const value = text(label, `labels.${echoId}`, fail);
        if (value !== "new" && !topicIds.has(value)) {
          fail(`labels.${echoId}`, "must be a shortlisted topic id or new");
        }
        out.labels[echoId] = value;
      }
    }
    return out;
  }

  if (root.labels !== undefined) fail("labels", "only assign cases have labels");
  if (root.input === undefined) fail("input", "is required");
  const o = record(root.input, "input", ["name", "echoes", "languages", "first"], fail);
  const echoes = list(o.echoes, "input.echoes", fail).map((e, i) =>
    echo(e, `input.echoes.${i}`, fail),
  );
  if (echoes.length === 0) fail("input.echoes", "must have at least one echo");
  unique(
    echoes.map((e) => e.id),
    "input.echoes",
    fail,
  );
  const languages = list(o.languages, "input.languages", fail).map((l, i) => {
    const parsed = LanguageSchema.safeParse(l);
    if (!parsed.success) fail(`input.languages.${i}`, `must be one of ${LanguageSchema.options}`);
    return parsed.data as SummarizeInput["languages"][number];
  });
  if (languages.length === 0) fail("input.languages", "must have at least one language");
  if (typeof o.first !== "boolean") fail("input.first", "must be true or false");
  return {
    id,
    ...frozenFrom,
    input: { name: text(o.name, "input.name", fail), echoes, languages, first: o.first as boolean },
  };
}

export interface LoadOptions {
  /** The folder is committed: a case frozen from a run is refused. */
  committed?: boolean;
}

/** Every case of `task` under `dir/<task>/`, by file name. A missing folder has none. */
export function loadTaskCases(dir: string, task: "assign", options?: LoadOptions): AssignCase[];
export function loadTaskCases(
  dir: string,
  task: "summarize",
  options?: LoadOptions,
): SummarizeCase[];
export function loadTaskCases(
  dir: string,
  task: Task,
  options: LoadOptions = {},
): (AssignCase | SummarizeCase)[] {
  const folder = join(dir, task);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const file = join(task, f);
      let json: unknown;
      try {
        json = JSON.parse(readFileSync(join(folder, f), "utf8"));
      } catch {
        throw new CaseError(file, "", "is not JSON");
      }
      const c = parseCase(task, basename(f, ".json"), json, file);
      if (options.committed && c.frozenFrom !== undefined) {
        throw new CaseError(
          file,
          "frozenFrom",
          "a case frozen from a run is never committed; keep it in a git-ignored folder",
        );
      }
      return c;
    });
}

export function loadCases(dir: string, options: LoadOptions = {}): Cases {
  return {
    assign: loadTaskCases(dir, "assign", options),
    summarize: loadTaskCases(dir, "summarize", options),
  };
}
