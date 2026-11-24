/**
 * The validate step (M1-18, #34): which of this slot's drafts may be
 * published. Code decides (invariant 1); this step writes nothing and
 * returns topic ids.
 *
 * A draft passes `validateDraft` only when all of these hold; otherwise it
 * is discarded as a whole, and the commit step records a `discarded` row:
 *
 * - `contract`: the answer fits `SummarizeResultSchema`;
 * - `echo_id`: every cited echo id is one the model was given, so code can
 *   map each to its URL (invariant 2). One unknown id discards the version;
 * - `languages`: exactly one text per language asked for (a language
 *   repeated in settings counts once);
 * - `criterion`: a first summary has a criterion that is not only
 *   whitespace, so it can never be published without its prediction
 *   (invariant 5);
 * - `address`: no title, body or criterion holds a URL scheme, `www.`, or
 *   a dotted word (`x.ai`) that none of the offered echoes' titles or
 *   excerpts has (`nameCitesNoAddress`, as for assign's topic names): the
 *   model cites by id, never by address (invariant 2).
 *
 * A draft that is missing from blob storage fails the step: the summarize
 * step said it was there. The output holds ids and check names only.
 */
import { type SummarizeResult, SummarizeResultSchema } from "@bd/contracts";
import { echoes } from "@bd/db";
import type { Blobs } from "@bd/ports";
import { sql } from "drizzle-orm";
import { nameCitesNoAddress } from "./assign.ts";
import type { Step, StepContext } from "./runner.ts";
import { type Draft, draftKey, outputOf, type SummarizeOutput } from "./summarize.ts";

export interface ValidateDeps {
  blobs: Blobs;
}

/** Why a draft was discarded: the first check it failed. */
export type DraftCheck = "contract" | "echo_id" | "languages" | "criterion" | "address";

/** What the step returns; the runner stores it in `run_steps.output`. Ids only. */
export interface ValidateOutput {
  /** Drafts that may be published, in summarize's order. */
  valid: string[];
  /** Drafts to record as discarded, with the check each failed. */
  discarded: { topicId: string; check: DraftCheck }[];
}

export type DraftVerdict = { ok: true; value: SummarizeResult } | { ok: false; check: DraftCheck };

/**
 * Whether a draft may be published. `reference` is the offered echoes'
 * titles and excerpts, the only text a dotted word may come from. Pure;
 * exported for tests and for the commit step.
 */
export function validateDraft(draft: Draft, reference: string): DraftVerdict {
  const parsed = SummarizeResultSchema.safeParse(draft.answer);
  if (!parsed.success) return { ok: false, check: "contract" };
  const value = parsed.data;
  const offered = new Set(draft.offered);
  if (!value.evidenceEchoIds.every((id) => offered.has(id))) return { ok: false, check: "echo_id" };
  const langs = value.texts.map((t) => t.lang);
  // A language repeated in settings is asked for once.
  const asked = [...new Set(draft.languages)];
  if (
    langs.length !== asked.length ||
    new Set(langs).size !== langs.length ||
    !asked.every((l) => langs.includes(l as (typeof langs)[number]))
  ) {
    return { ok: false, check: "languages" };
  }
  if (draft.first && (value.criterion === undefined || value.criterion.trim() === "")) {
    return { ok: false, check: "criterion" };
  }
  const written = value.texts.flatMap((t) => [t.title, t.body]);
  if (draft.first && value.criterion !== undefined) written.push(value.criterion);
  if (!written.every((text) => nameCitesNoAddress(text, reference))) {
    return { ok: false, check: "address" };
  }
  return { ok: true, value };
}

/** A stored draft; throws when it is missing. */
export async function readDraft(blobs: Blobs, slot: string, topicId: string): Promise<Draft> {
  const bytes = await blobs.get(draftKey(slot, topicId));
  if (bytes === null) throw new Error(`no draft for ${topicId} in ${slot}`);
  return JSON.parse(new TextDecoder().decode(bytes)) as Draft;
}

/** The titles and excerpts of the echoes a draft was offered, as one text. */
export async function referenceText(ctx: StepContext, draft: Draft): Promise<string> {
  const rows = await ctx.db
    .select({ title: echoes.title, excerpt: echoes.excerpt })
    .from(echoes)
    .where(sql`${echoes.id} IN (SELECT value FROM json_each(${JSON.stringify(draft.offered)}))`);
  return rows.flatMap((r) => [r.title, r.excerpt ?? ""]).join("\n");
}

export function validateStep(deps: ValidateDeps): Step {
  return {
    name: "validate",
    async run(ctx): Promise<ValidateOutput> {
      const output: ValidateOutput = { valid: [], discarded: [] };
      for (const { topicId } of outputOf<SummarizeOutput>(ctx, "summarize").drafted) {
        const draft = await readDraft(deps.blobs, ctx.slot, topicId);
        const verdict = validateDraft(draft, await referenceText(ctx, draft));
        if (verdict.ok) output.valid.push(topicId);
        else output.discarded.push({ topicId, check: verdict.check });
      }
      return output;
    },
  };
}
