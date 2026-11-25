/**
 * The summarize step (M1-18, #34): one tool-less model call per wave the
 * select step chose. The model proposes; validate and commit decide what is
 * stored (invariant 1, ADR 0003).
 *
 * 1. **Waves.** The `selected` list of this slot's select output, in order.
 * 2. **Input.** The topic's name and its echoes first seen in this slot or
 *    earlier (id, title, excerpt), oldest first; the languages from
 *    settings; `first` when the reason is `formed`, so the model proposes
 *    the review criterion. An echo whose page the enrich step read (#45)
 *    has that text after its excerpt, in the same `summary` field. The
 *    draft records whether any did (`sourceTextRead`); a wave enrich left
 *    unread, or a run with no enrich output (one started before the step
 *    existed), is written from titles and excerpts only.
 * 3. **Draft.** The model's answer, with what the step asked for (the echo
 *    ids it offered, the languages, `first`) and who answered, goes to the
 *    blob `draftKey(slot, topicId)`. The model's text is data, kept out of
 *    `run_steps` (invariant 6), so the steps pass topic ids only. Drafts sit
 *    under `raw/<slot>/`, so retention removes them with the scan's raw
 *    responses (`rawRetentionDays`).
 * 4. **Failures.** A wave whose model call fails gets no draft and no
 *    summary row; it is due again next run. The error is not kept, since it
 *    may quote the model's answer.
 *
 * With no summarize model (an empty `summarizeProviders` chain, #42) the
 * step makes no call, writes no draft and marks its output `skipped`; the
 * selected waves stay due for a later run.
 *
 * A retried or resumed attempt asks again and replaces the drafts.
 */
import type { SummaryReason } from "@bd/core";
import { type Db, echoes, topics } from "@bd/db";
import type { DriverEcho, ModelDriver } from "@bd/judge";
import type { Blobs } from "@bd/ports";
import { and, asc, eq, lte } from "drizzle-orm";
import { type EnrichOutput, readEnriched } from "./enrich.ts";
import type { Step, StepContext } from "./runner.ts";
import type { SelectOutput } from "./select.ts";
import { readSettings } from "./settings.ts";

export interface SummarizeDeps {
  /** Null: no summarize model this run (an empty chain, #42); the step is skipped. */
  driver: ModelDriver | null;
  blobs: Blobs;
}

/** What the step returns; the runner stores it in `run_steps.output`. Ids only. */
export interface SummarizeOutput {
  /** Waves with a draft at `draftKey(slot, topicId)`, in select's order. */
  drafted: { topicId: string; reason: SummaryReason }[];
  /** Waves whose model call failed, or that have no echo to cite. */
  failed: string[];
  /** Set when there was no summarize model: no call was made, no draft written. */
  skipped?: true;
}

/** One draft as stored in the blob. Written by code except `answer`. */
export interface Draft {
  topicId: string;
  reason: SummaryReason;
  /** True when the model was asked for the review criterion. */
  first: boolean;
  /** The echo ids the model was given; the only ones it may cite. */
  offered: string[];
  /** The languages it was asked to write, in order. */
  languages: string[];
  /** True when at least one offered echo came with its page's text (enrich, #45). */
  sourceTextRead: boolean;
  /** Who answered (ADR 0005). */
  provider: string;
  model: string;
  /** The model's answer, unvalidated beyond the driver's own contract check. */
  answer: unknown;
}

export function draftKey(slot: string, topicId: string): string {
  return `raw/${slot}/summarize/${topicId}.json`;
}

/** The output of an earlier step of this slot, by name. */
export function outputOf<T>(ctx: StepContext, step: string): T {
  const out = ctx.outputs.get(step);
  if (out === undefined || out === null) throw new Error(`${ctx.slot}: no ${step} output`);
  return out as T;
}

/**
 * A topic's echoes first seen in `slot` or earlier, oldest first. An echo in
 * `pages` has its page text after its excerpt.
 */
async function topicEchoes(
  db: Db,
  topicId: string,
  slot: string,
  pages: ReadonlyMap<string, string>,
): Promise<DriverEcho[]> {
  const rows = await db
    .select({ id: echoes.id, title: echoes.title, excerpt: echoes.excerpt })
    .from(echoes)
    .where(and(eq(echoes.topicId, topicId), lte(echoes.firstSlot, slot)))
    .orderBy(asc(echoes.firstSeenAt), asc(echoes.id));
  return rows.map((e) => {
    const summary = [e.excerpt, pages.get(e.id)].filter((t) => t).join("\n\n");
    return summary ? { id: e.id, title: e.title, summary } : { id: e.id, title: e.title };
  });
}

export function summarizeStep(deps: SummarizeDeps): Step {
  return {
    name: "summarize",
    async run(ctx): Promise<SummarizeOutput> {
      const { settings } = await readSettings(ctx.db, ctx.now());
      const output: SummarizeOutput = { drafted: [], failed: [] };
      const driver = deps.driver;
      if (driver === null) return { ...output, skipped: true };
      const enrich = ctx.outputs.get("enrich") as EnrichOutput | null | undefined;
      const enriched = new Set((enrich?.read ?? []).map((r) => r.topicId));
      for (const { topicId, reason } of outputOf<SelectOutput>(ctx, "select").selected) {
        const topic = await ctx.db
          .select({ name: topics.name })
          .from(topics)
          .where(eq(topics.id, topicId))
          .get();
        const pages = enriched.has(topicId)
          ? await readEnriched(deps.blobs, ctx.slot, topicId)
          : new Map<string, string>();
        const cited = topic ? await topicEchoes(ctx.db, topicId, ctx.slot, pages) : [];
        if (!topic || cited.length === 0) {
          output.failed.push(topicId);
          continue;
        }
        const first = reason === "formed";
        // A language repeated in settings is asked for once.
        const languages = [...new Set(settings.languages)];
        let answer: Awaited<ReturnType<ModelDriver["summarize"]>>;
        try {
          answer = await driver.summarize({
            name: topic.name,
            echoes: cited,
            languages,
            first,
          });
        } catch {
          // The error may quote the model's answer: count it, keep nothing.
          output.failed.push(topicId);
          continue;
        }
        const draft: Draft = {
          topicId,
          reason,
          first,
          offered: cited.map((e) => e.id),
          languages,
          sourceTextRead: cited.some((e) => pages.has(e.id)),
          provider: answer.provider,
          model: answer.model,
          answer: answer.value,
        };
        await deps.blobs.put(
          draftKey(ctx.slot, topicId),
          JSON.stringify(draft),
          "application/json",
        );
        output.drafted.push({ topicId, reason });
      }
      return output;
    },
  };
}
