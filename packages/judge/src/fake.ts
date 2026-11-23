/**
 * The fake model driver: deterministic assign and summarize for tests and
 * previews (#31). No network, no clock, no randomness: the same input always
 * gives the same output, and the output passes the model contracts.
 *
 * Assign matches an echo's title to topic names by shared words. Summarize
 * writes a fixed sentence per language and cites every echo it was given.
 * Every text it writes is marked as fake.
 */
import {
  type AssignResult,
  AssignResultSchema,
  type Language,
  type SummarizeResult,
  SummarizeResultSchema,
} from "@bd/contracts";
import type { AssignInput, ModelDriver, SummarizeInput } from "./driver.ts";
import type { ChainResult } from "./index.ts";

/** What a fake result names as its provider and model. */
export const FAKE_PROVIDER = "fake";
export const FAKE_MODEL = "fake";

/** Words an echo title and a topic name must share for a match. */
const MIN_SHARED_WORDS = 2;

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "was",
  "its",
  "into",
  "about",
  "how",
  "why",
  "what",
  "new",
]);

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * The words of a text: lowercase letter-and-digit runs, without stopwords and
 * one-character runs. A run with CJK characters, which has no spaces, gives
 * its character pairs instead.
 */
export function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const run of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (CJK.test(run)) {
      const chars = Array.from(run);
      if (chars.length === 1) out.add(run);
      for (let i = 0; i + 1 < chars.length; i++) out.add(`${chars[i]}${chars[i + 1]}`);
    } else if (run.length > 1 && !STOPWORDS.has(run)) {
      out.add(run);
    }
  }
  return out;
}

function shared(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

/** Cut to at most `max` UTF-16 units (what the schemas count), never inside a character. */
function clip(text: string, max: number): string {
  let out = "";
  for (const ch of text) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}

/**
 * Each echo goes to the shortlisted topic whose name or alias shares the most
 * words with its title, if that is at least `MIN_SHARED_WORDS`; ties go to the
 * earlier topic. Otherwise to a new topic proposed earlier in the same batch
 * that matches the same way, so similar new echoes propose one name; else to
 * a new topic named after its title.
 */
export function fakeAssign(input: AssignInput): AssignResult {
  const topics = input.topics.map((t) => ({
    id: t.id,
    names: [t.name, ...(t.aliases ?? [])].map(words),
  }));
  const proposed: { name: string; words: Set<string> }[] = [];
  const assignments: AssignResult["assignments"] = [];
  for (const echo of input.echoes) {
    const title = words(echo.title);
    let best: { id: string; score: number } | undefined;
    for (const t of topics) {
      const score = Math.max(0, ...t.names.map((n) => shared(title, n)));
      if (score >= MIN_SHARED_WORDS && (!best || score > best.score)) best = { id: t.id, score };
    }
    if (best) {
      assignments.push({ echoId: echo.id, topicId: best.id });
      continue;
    }
    let reuse: { name: string; score: number } | undefined;
    for (const p of proposed) {
      const score = shared(title, p.words);
      if (score >= MIN_SHARED_WORDS && (!reuse || score > reuse.score)) {
        reuse = { name: p.name, score };
      }
    }
    const name = reuse?.name ?? clip(echo.title.trim() || echo.id, 120);
    if (!reuse) proposed.push({ name, words: title });
    assignments.push({ echoId: echo.id, newTopic: { name } });
  }
  return AssignResultSchema.parse({ assignments });
}

const BODY: Record<Language, (name: string, count: number) => string> = {
  en: (name, count) => `[fake] Summary of ${count} echoes about "${name}".`,
  zh: (name, count) => `[模拟] 关于"${name}"的 ${count} 条回响的摘要。`,
  ja: (name, count) => `[模擬]「${name}」に関するエコー ${count} 件の要約。`,
};

/**
 * One text per requested language, titled with the topic name; cites every
 * echo once, in input order; no risk flags; a criterion on the first summary.
 */
export function fakeSummarize(input: SummarizeInput): SummarizeResult {
  const ids = [...new Set(input.echoes.map((e) => e.id))];
  if (ids.length === 0) throw new Error("fake summarize: no echoes to cite");
  const name = clip(input.name.trim() || "untitled", 120);
  const languages = [...new Set(input.languages)];
  return SummarizeResultSchema.parse({
    texts: languages.map((lang) => ({
      lang,
      title: clip(name, 160),
      body: clip(BODY[lang](name, ids.length), 1200),
    })),
    evidenceEchoIds: ids,
    riskFlags: [],
    ...(input.first
      ? {
          criterion: clip(
            `[fake] Another independent source reports on "${name}" within the review window.`,
            600,
          ),
        }
      : {}),
  });
}

function result<T>(value: T): ChainResult<T> {
  return { value, provider: FAKE_PROVIDER, model: FAKE_MODEL, repaired: false };
}

/** The fake as a `ModelDriver`, for a step that takes either driver. */
export function fakeDriver(): ModelDriver {
  return {
    assign: async (input) => result(fakeAssign(input)),
    summarize: async (input) => result(fakeSummarize(input)),
  };
}
