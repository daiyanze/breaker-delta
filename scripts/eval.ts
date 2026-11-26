/**
 * The eval (#50): run every shipped prompt (`PROMPTS` in `@bd/judge`) over
 * its cases in `evals/cases/<task>/` through the provider chain, and score
 * the answers with the pipeline's own checks. See `evals/README.md`.
 *
 *   bun scripts/eval.ts [--cases evals/cases] [--providers evals/providers.json]
 *                       [--report report.md] [--json result.json] [--sha <commit>]
 *
 * `--cases` defaults to the committed, synthetic cases (CI runs those). The
 * owner can name a local, git-ignored folder of cases frozen from real runs
 * (`scripts/freeze-cases.ts`, default `.bd-data/eval-cases`); a frozen case
 * in `evals/cases/` is refused.
 *
 * Keys are read from the environment by the names in the providers file
 * (`apiKeyRef`), as the pipeline reads them (`resolveProviders`). A provider
 * whose key is not set is left out.
 *
 * Exit code: 0 when every shipped prompt was evaluated (or none ships); 1
 * when a prompt has no cases or no provider with a key, so a prompt PR whose
 * eval could not run is red; 2 on a bad case or providers file.
 *
 * Only numbers, case counts, failure kinds, HTTP status codes, case ids,
 * prompt versions, provider and model names leave this script. The model's
 * answers can quote fetched text, and the report is posted on a PR that a
 * coding session reads (invariant 6), so no answer, no case text and no
 * chain error message (it may quote an answer) is printed or written.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { validateAssignments } from "../apps/pipeline/src/core/assign.ts";
import { resolveProviders, stringVars } from "../apps/pipeline/src/core/model.ts";
import { validateDraft } from "../apps/pipeline/src/core/validate.ts";
import type { AssignResult, SummarizeResult } from "../packages/contracts/src/index.ts";
import { type Provider, ProviderSchema } from "../packages/contracts/src/index.ts";
import {
  type Attempt,
  ChainExhaustedError,
  type ChainResult,
  chainDriver,
  FAILURE_KINDS,
  PROMPTS,
  type Prompts,
  type ResolvedProvider,
} from "../packages/judge/src/index.ts";
import {
  type AssignCase,
  CaseError,
  type Cases,
  COMMITTED_CASES,
  loadCases,
  type SummarizeCase,
  TASKS,
  type Task,
} from "./eval-cases.ts";

/** A count out of a total; the report prints both, never only a rate. */
export interface Ratio {
  n: number;
  of: number;
}

export interface Metrics {
  /** Cases whose chain returned an answer that fits the task's contract. */
  contract: Ratio;
  /**
   * assign: echoes the pipeline would place (`validateAssignments`), of the
   * echoes in all cases. summarize: answers that cite only offered echoes.
   */
  citations: Ratio;
  /** summarize only: answers with exactly one text per language asked for. */
  languages?: Ratio;
  /** summarize only: answers the validate step would publish (`validateDraft`). */
  publishable?: Ratio;
  /** Answers that needed the chain's one repair, of the answers. */
  repaired: Ratio;
  /** Answers from a provider other than the chain's first, of the answers. */
  fallback: Ratio;
  /** assign only, when cases have labels: labelled echoes placed as the owner did. */
  agreement?: Ratio;
  /**
   * The answered cases by the provider that answered: every provider of the
   * chain, in chain order, with the ids of its cases (none for a provider
   * that answered nothing).
   */
  answeredBy: { provider: string; cases: string[] }[];
  /**
   * The cases with no answer, by why the chain's last provider failed (its
   * `failure`): case ids only, never an error message, answer or case text.
   * Only failures that occurred are present.
   */
  unanswered: Record<string, string[]>;
  /**
   * Per case with no answer, in case order: why each provider the chain
   * tried failed, in chain order.
   */
  tried: { case: string; failures: { provider: string; failure: string }[] }[];
}

/**
 * Why one provider gave no answer, as the report shows it: `http-<status>`
 * (`http-503`) when it answered with an HTTP error status, else the
 * attempt's kind (`timeout`, `network`, `empty`, `not-json`, `schema`,
 * `other`). Never error text.
 */
export function failure(attempt: Pick<Attempt, "kind" | "status">): string {
  return attempt.status !== undefined ? `http-${attempt.status}` : attempt.kind;
}

export type TaskResult =
  | { task: Task; status: "no-prompt" }
  | { task: Task; status: "no-cases"; prompt: string }
  | { task: Task; status: "no-provider"; prompt: string; cases: number; keys: string[] }
  | {
      task: Task;
      status: "ran";
      prompt: string;
      cases: number;
      providers: { name: string; model: string }[];
      metrics: Metrics;
    };

export interface EvalResult {
  sha?: string;
  tasks: TaskResult[];
}

/** The chain per task, as the providers file holds it (`Provider` from settings). */
export interface ProviderFile {
  assign: Provider[];
  summarize: Provider[];
}

export interface EvalOptions {
  prompts: Prompts;
  cases: Cases;
  providers: ProviderFile;
  /** Reads a key by its `apiKeyRef`. */
  secret: (name: string) => string | undefined;
  fetch?: typeof fetch;
}

const ratio = (n: number, of: number): Ratio => ({ n, of });

/** What `ask` keeps about the cases with no answer. */
interface Misses {
  unanswered: Metrics["unanswered"];
  tried: Metrics["tried"];
}

/**
 * One case through the chain as the pipeline calls it (`chainDriver`: the
 * same contract check and repair message). Null when the chain is
 * exhausted; its error may quote an answer, so only each provider's
 * `failure` is kept, under the case id, in `misses`.
 */
async function ask<T>(
  id: string,
  misses: Misses,
  call: () => Promise<ChainResult<T>>,
): Promise<ChainResult<T> | null> {
  try {
    return await call();
  } catch (err) {
    const failures =
      err instanceof ChainExhaustedError
        ? err.attempts.map((a) => ({ provider: a.provider, failure: failure(a) }))
        : [];
    const last = failures.at(-1)?.failure ?? "other";
    misses.unanswered[last] = [...(misses.unanswered[last] ?? []), id];
    misses.tried.push({ case: id, failures });
    return null;
  }
}

/** HTTP statuses in number order, then the other kinds in `FAILURE_KINDS` order. */
function rank(f: string): number {
  const status = /^http-(\d+)$/.exec(f)?.[1];
  if (status !== undefined) return Number(status);
  const i = (FAILURE_KINDS as readonly string[]).indexOf(f);
  return 1000 + (i === -1 ? FAILURE_KINDS.length : i);
}

/** The failures in `rank` order, so a result reads the same each run. */
function ordered(unanswered: Metrics["unanswered"]): Metrics["unanswered"] {
  const out: Metrics["unanswered"] = {};
  for (const f of Object.keys(unanswered).sort((x, y) => rank(x) - rank(y)))
    out[f] = unanswered[f] ?? [];
  return out;
}

const noMisses = (): Misses => ({ unanswered: {}, tried: [] });

/** A prompt for the task a driver is not used for here. */
const unused = (): never => {
  throw new Error("not this task's prompt");
};

function chainCounts(
  answers: readonly (ChainResult<unknown> | null)[],
  ids: readonly string[],
  chain: readonly ResolvedProvider[],
  misses: Misses,
) {
  const got = answers.filter((a): a is ChainResult<unknown> => a !== null);
  const first = chain[0]?.name ?? "";
  const names = [...new Set(chain.map((p) => p.name))];
  return {
    contract: ratio(got.length, answers.length),
    repaired: ratio(got.filter((a) => a.repaired).length, got.length),
    fallback: ratio(got.filter((a) => a.provider !== first).length, got.length),
    answeredBy: names.map((provider) => ({
      provider,
      cases: ids.filter((_, i) => answers[i]?.provider === provider),
    })),
    unanswered: ordered(misses.unanswered),
    tried: misses.tried,
  };
}

/** The placement code keeps for one echo, as a label: a topic id or `new`. */
function placed(p: { topicId: string } | { newTopic: string }): string {
  return "topicId" in p ? p.topicId : "new";
}

async function evalAssign(
  cases: readonly AssignCase[],
  chain: ResolvedProvider[],
  prompt: NonNullable<Prompts["assign"]>,
  fetchImpl?: typeof fetch,
): Promise<Metrics> {
  const driver = chainDriver(
    chain,
    { assign: (i) => prompt.messages(i), summarize: unused, versions: { assign: prompt.version } },
    fetchImpl ? { fetch: fetchImpl } : {},
  );
  const answers: (ChainResult<AssignResult> | null)[] = [];
  const misses = noMisses();
  let echoes = 0;
  let kept = 0;
  let labelled = 0;
  let agreed = 0;
  for (const c of cases) {
    const answer = await ask(c.id, misses, () => driver.assign(c.input));
    answers.push(answer);
    echoes += c.input.echoes.length;
    const { placements } = answer
      ? validateAssignments(
          c.input.echoes,
          c.input.topics.map((t) => t.id),
          answer.value,
        )
      : { placements: new Map() };
    kept += placements.size;
    for (const [echoId, label] of Object.entries(c.labels ?? {})) {
      labelled++;
      const p = placements.get(echoId);
      if (p && placed(p) === label) agreed++;
    }
  }
  const metrics: Metrics = {
    ...chainCounts(
      answers,
      cases.map((c) => c.id),
      chain,
      misses,
    ),
    citations: ratio(kept, echoes),
  };
  if (labelled > 0) metrics.agreement = ratio(agreed, labelled);
  return metrics;
}

async function evalSummarize(
  cases: readonly SummarizeCase[],
  chain: ResolvedProvider[],
  prompt: NonNullable<Prompts["summarize"]>,
  fetchImpl?: typeof fetch,
): Promise<Metrics> {
  const driver = chainDriver(
    chain,
    {
      assign: unused,
      summarize: (i) => prompt.messages(i),
      versions: { summarize: prompt.version },
    },
    fetchImpl ? { fetch: fetchImpl } : {},
  );
  const answers: (ChainResult<SummarizeResult> | null)[] = [];
  const misses = noMisses();
  let cited = 0;
  let complete = 0;
  let publishable = 0;
  for (const c of cases) {
    const answer = await ask(c.id, misses, () => driver.summarize(c.input));
    answers.push(answer);
    if (!answer) continue;
    const offered = c.input.echoes.map((e) => e.id);
    const asked = [...new Set(c.input.languages)];
    const langs = answer.value.texts.map((t) => t.lang);
    if (answer.value.evidenceEchoIds.every((id) => offered.includes(id))) cited++;
    if (langs.length === asked.length && asked.every((l) => langs.includes(l))) complete++;
    // The validate step's verdict on the same draft (`validate.ts`).
    const verdict = validateDraft(
      {
        topicId: c.id,
        reason: c.input.first ? "formed" : "new_echoes",
        first: c.input.first,
        offered,
        languages: asked,
        provider: answer.provider,
        model: answer.model,
        answer: answer.value,
        // As the summarize step sets it: an offered echo came with its page.
        sourceTextRead: c.input.echoes.some((e) => e.page !== undefined),
      },
      // As the validate step's `referenceText`: titles and excerpts, not pages.
      c.input.echoes.flatMap((e) => [e.title, e.summary ?? ""]).join("\n"),
    );
    if (verdict.ok) publishable++;
  }
  const counts = chainCounts(
    answers,
    cases.map((c) => c.id),
    chain,
    misses,
  );
  const n = counts.contract.n;
  return {
    ...counts,
    citations: ratio(cited, n),
    languages: ratio(complete, n),
    publishable: ratio(publishable, n),
  };
}

/** Evaluate every prompt in `prompts` over its cases. Cases run one at a time, in order. */
export async function runEval(options: EvalOptions): Promise<TaskResult[]> {
  const out: TaskResult[] = [];
  for (const task of TASKS) {
    const prompt = options.prompts[task];
    if (!prompt) {
      out.push({ task, status: "no-prompt" });
      continue;
    }
    const cases = options.cases[task];
    if (cases.length === 0) {
      out.push({ task, status: "no-cases", prompt: prompt.version });
      continue;
    }
    const configured = options.providers[task];
    const chain = resolveProviders(configured, options.secret);
    if (chain.length === 0) {
      const keys = [...new Set(configured.flatMap((p) => (p.apiKeyRef ? [p.apiKeyRef] : [])))];
      out.push({ task, status: "no-provider", prompt: prompt.version, cases: cases.length, keys });
      continue;
    }
    const metrics =
      task === "assign"
        ? await evalAssign(
            options.cases.assign,
            chain,
            options.prompts.assign as NonNullable<Prompts["assign"]>,
            options.fetch,
          )
        : await evalSummarize(
            options.cases.summarize,
            chain,
            options.prompts.summarize as NonNullable<Prompts["summarize"]>,
            options.fetch,
          );
    out.push({
      task,
      status: "ran",
      prompt: prompt.version,
      cases: cases.length,
      providers: chain.map((p) => ({ name: p.name, model: p.model })),
      metrics,
    });
  }
  return out;
}

/** Whether the result is a pass for CI: every shipped prompt was evaluated. */
export function evaluated(tasks: readonly TaskResult[]): boolean {
  return tasks.every((t) => t.status === "no-prompt" || t.status === "ran");
}

/** The first line of the PR comment, which the workflow finds it by. */
export const MARKER = "<!-- bd-evals -->";

function cell(r: Ratio | undefined): string {
  if (!r) return "-";
  if (r.of === 0) return "0/0";
  return `${r.n}/${r.of} (${Math.round((r.n / r.of) * 100)}%)`;
}

/** Markdown for the PR comment: numbers, versions and provider names only. */
export function report(result: EvalResult): string {
  const lines = [MARKER, `### Eval${result.sha ? ` for ${result.sha.slice(0, 7)}` : ""}`, ""];
  const ran = result.tasks.filter((t) => t.status === "ran");
  if (ran.length > 0) {
    lines.push(
      "| task | prompt | cases | contract | citations | languages | publishable | repaired | fallback | agreement |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const t of ran) {
      const m = t.metrics;
      lines.push(
        `| ${t.task} | \`${t.prompt}\` | ${t.cases} | ${cell(m.contract)} | ${cell(m.citations)} | ${cell(m.languages)} | ${cell(m.publishable)} | ${cell(m.repaired)} | ${cell(m.fallback)} | ${cell(m.agreement)} |`,
      );
    }
    lines.push("");
    for (const t of ran) {
      lines.push(
        `- ${t.task} chain: ${t.providers.map((p) => `${p.name} \`${p.model}\``).join(", ")}`,
      );
    }
    const ids = (list: readonly string[]) => list.map((id) => `\`${id}\``).join(", ");
    for (const t of ran) {
      // The first provider's cases are the default and go uncounted by id.
      const by = t.metrics.answeredBy.map(({ provider, cases }, i) =>
        i === 0 || cases.length === 0
          ? `${provider} ${cases.length}`
          : `${provider} ${cases.length} (${ids(cases)})`,
      );
      lines.push(`- ${t.task} answered by: ${by.join("; ")}`);
    }
    for (const t of ran) {
      const kinds = Object.entries(t.metrics.unanswered);
      lines.push(
        kinds.length === 0
          ? `- ${t.task} unanswered: none`
          : `- ${t.task} unanswered, by why the last provider failed: ${kinds
              .map(([kind, list]) => `\`${kind}\` ${list.length} (${ids(list)})`)
              .join("; ")}`,
      );
      if (t.metrics.tried.length > 0) {
        lines.push(
          `- ${t.task} unanswered, why each provider failed: ${t.metrics.tried
            .map(
              (c) =>
                `\`${c.case}\` (${c.failures.map((f) => `${f.provider} \`${f.failure}\``).join(", ") || "no provider tried"})`,
            )
            .join("; ")}`,
        );
      }
    }
    lines.push("");
  }
  for (const t of result.tasks) {
    if (t.status === "no-prompt") lines.push(`- ${t.task}: no prompt ships, nothing to evaluate.`);
    if (t.status === "no-cases") {
      lines.push(
        `- ${t.task}: prompt \`${t.prompt}\` has no cases in \`evals/cases/${t.task}/\`. **Not evaluated.**`,
      );
    }
    if (t.status === "no-provider") {
      const keys =
        t.keys.length > 0
          ? `set ${t.keys.map((k) => `\`${k}\``).join(" or ")}`
          : "add a provider to `evals/providers.json`";
      lines.push(
        `- ${t.task}: prompt \`${t.prompt}\`, ${t.cases} cases, but no provider has a key (${keys} in the \`evals\` environment). **Not evaluated.**`,
      );
    }
  }
  lines.push(
    "",
    "Metrics are defined in `evals/README.md`. citations, languages and publishable count answered cases.",
  );
  return `${lines.join("\n")}\n`;
}

/** Reads the providers file; throws naming the chain and index of a bad entry. */
export function parseProviders(json: unknown): ProviderFile {
  const o = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;
  const out: ProviderFile = { assign: [], summarize: [] };
  for (const key of Object.keys(o)) {
    if (!(TASKS as readonly string[]).includes(key))
      throw new Error(`providers: ${key} is not a task`);
  }
  for (const task of TASKS) {
    const chain = o[task] ?? [];
    if (!Array.isArray(chain)) throw new Error(`providers: ${task} must be an array`);
    out[task] = chain.map((p, i) => {
      const parsed = ProviderSchema.strict().safeParse(p);
      if (!parsed.success) throw new Error(`providers: ${task}.${i} is not a provider`);
      return parsed.data;
    });
  }
  return out;
}

/** Whether `dir` is the committed cases folder, where a frozen case is refused. */
export function isCommitted(dir: string): boolean {
  return resolve(dir) === resolve(COMMITTED_CASES);
}

export interface Io {
  out(line: string): void;
  env: Record<string, string | undefined>;
  fetch?: typeof fetch;
  prompts?: Prompts;
}

const defaultIo: Io = { out: (line) => console.log(line), env: process.env };

/** Runs the command; resolves to the exit code. */
export async function main(argv: readonly string[], io: Io = defaultIo): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      cases: { type: "string", default: COMMITTED_CASES },
      providers: { type: "string", default: join(COMMITTED_CASES, "..", "providers.json") },
      report: { type: "string" },
      json: { type: "string" },
      sha: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    io.out(
      "usage: bun scripts/eval.ts [--cases dir] [--providers file] [--report out.md] [--json out.json] [--sha commit]",
    );
    return 0;
  }
  let cases: Cases;
  let providers: ProviderFile;
  try {
    cases = loadCases(values.cases, { committed: isCommitted(values.cases) });
    providers = existsSync(values.providers)
      ? parseProviders(JSON.parse(readFileSync(values.providers, "utf8")))
      : { assign: [], summarize: [] };
  } catch (err) {
    // CaseError names the file and the path only, never a value.
    io.out(err instanceof CaseError || err instanceof Error ? err.message : String(err));
    return 2;
  }
  const tasks = await runEval({
    prompts: io.prompts ?? PROMPTS,
    cases,
    providers,
    secret: stringVars(io.env),
    ...(io.fetch ? { fetch: io.fetch } : {}),
  });
  const result: EvalResult = { ...(values.sha ? { sha: values.sha } : {}), tasks };
  const markdown = report(result);
  if (values.report) writeFileSync(values.report, markdown);
  if (values.json) writeFileSync(values.json, `${JSON.stringify(result, null, 2)}\n`);
  io.out(markdown.trimEnd());
  return evaluated(tasks) ? 0 : 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
