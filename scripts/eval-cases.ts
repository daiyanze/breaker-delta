/**
 * The eval case format (#50). One case is one JSON file under
 * `evals/cases/<task>/<id>.json`, the input of one model call exactly as the
 * pipeline's step builds it (`AssignInput`, `SummarizeInput` from
 * `@bd/judge`), plus where it came from and, for assign, the owner's labels:
 *
 *   { "frozenFrom": "<slot>", "input": { ... }, "labels": { "<echo id>": "<topic id>" | "new" } }
 *
 * The parser is strict: a key the format does not name is refused, at any
 * depth. So a case holds only what the model sees (echo ids, titles and
 * excerpts, topic ids, names and aliases), never a URL, a source name or
 * other fetched text (AGENTS.md: no fetched article text beyond that, no
 * secrets, no subscriber data).
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

function text(v: unknown, path: string, fail: Fail): string {
  if (typeof v !== "string" || v.trim() === "") fail(path, "must be a non-empty string");
  return v as string;
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
  const root = record(json, "", ["frozenFrom", "input", "labels"], fail);
  const frozenFrom =
    root.frozenFrom === undefined ? {} : { frozenFrom: text(root.frozenFrom, "frozenFrom", fail) };

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

/** Every case of `task` under `dir/<task>/`, by file name. A missing folder has none. */
export function loadTaskCases(dir: string, task: "assign"): AssignCase[];
export function loadTaskCases(dir: string, task: "summarize"): SummarizeCase[];
export function loadTaskCases(dir: string, task: Task): (AssignCase | SummarizeCase)[] {
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
      return parseCase(task, basename(f, ".json"), json, file);
    });
}

export function loadCases(dir: string): Cases {
  return { assign: loadTaskCases(dir, "assign"), summarize: loadTaskCases(dir, "summarize") };
}
