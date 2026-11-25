/**
 * The commit step (M1-18, #34): write this slot's validated drafts as
 * summary versions, append-only (invariant 4).
 *
 * - **Published.** A valid draft becomes the topic's next version (1, 2,
 *   ...): a `summaries` row, one `summary_texts` row per language and one
 *   `summary_evidence` row per cited echo id, the ids passed as one JSON
 *   parameter (D1 binds at most 100 values per statement). Code maps ids
 *   to URLs later; no model-written address is stored (invariant 2).
 *   `writer` is the provider that answered, `model` its model and
 *   `prompt_version` the prompt's version (null while unversioned), so a
 *   summary can be traced to its origin (ADR 0005, #48).
 * - **First version.** When the topic has no published summary yet, the
 *   same batch also writes its `wave_formed` event and its prediction: the
 *   criterion, the SHA-256 of its text, `registered_at` at the slot's start
 *   and `due_at` `reviewWindowDays` later. That batch is the wave forming
 *   for invariant 5 (`docs/schema.md`, predictions; owner's decision,
 *   2026-11-24, #237). The batch is one transaction, so a version 1 is never
 *   stored without its prediction: if the prediction cannot be written, the
 *   summary is not either and the step fails. A later version writes a
 *   `summary_updated` event instead.
 * - **Discarded.** A draft validate refused gets a `discarded` row with no
 *   version, texts or evidence, so the topic page can say it failed checks.
 *   It writes no event and no prediction.
 *
 * Whether a version is the first is read from the database here, not taken
 * from the draft, and the draft is checked again as a first summary when it
 * is one, so a draft written without a criterion cannot become a version 1.
 *
 * A summary's id comes from its slot and topic, so a retried or resumed
 * attempt skips what an earlier attempt committed. Events are dated at the
 * slot's start. The output holds topic ids only.
 */
import { slotStart } from "@bd/core";
import { events, predictions, summaries, summaryTexts } from "@bd/db";
import type { Blobs } from "@bd/ports";
import { and, eq, max, sql } from "drizzle-orm";
import type { Step } from "./runner.ts";
import { readSettings } from "./settings.ts";
import { outputOf } from "./summarize.ts";
import { readDraft, referenceText, type ValidateOutput, validateDraft } from "./validate.ts";

export interface CommitDeps {
  blobs: Blobs;
}

/** What the step returns; the runner stores it in `run_steps.output`. Ids only. */
export interface CommitOutput {
  /** Topics given a new published version. */
  published: string[];
  /** Of those, the ones whose first version this was: their wave formed. */
  formed: string[];
  /** Topics whose draft was recorded as discarded. */
  discarded: string[];
}

const DAY_MS = 86_400_000;
/** Ids per `json_each` parameter, as in compute. */
const CHUNK = 500;

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** SHA-256 of `text` as UTF-8, lower-case hex. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The id of the summary a slot writes for a topic: the same on every attempt. */
export async function summaryId(slot: string, topicId: string): Promise<string> {
  return `s${(await sha256(`${slot}:${topicId}`)).slice(0, 24)}`;
}

export function commitStep(deps: CommitDeps): Step {
  return {
    name: "commit",
    async run(ctx): Promise<CommitOutput> {
      const nowMs = ctx.now();
      const at = slotStart(ctx.slot);
      const { settings } = await readSettings(ctx.db, nowMs);
      const { valid, discarded } = outputOf<ValidateOutput>(ctx, "validate");
      const output: CommitOutput = { published: [], formed: [], discarded: [] };

      const already = async (id: string) =>
        (await ctx.db
          .select({ id: summaries.id })
          .from(summaries)
          .where(eq(summaries.id, id))
          .get()) !== undefined;

      const discard = async (topicId: string) => {
        const id = await summaryId(ctx.slot, topicId);
        if (!(await already(id))) {
          const draft = await readDraft(deps.blobs, ctx.slot, topicId);
          await ctx.db.insert(summaries).values({
            id,
            topicId,
            version: null,
            status: "discarded",
            reason: draft.reason,
            writer: draft.provider,
            model: draft.model,
            promptVersion: draft.promptVersion ?? null,
            sourceTextRead: draft.sourceTextRead === true,
            slot: ctx.slot,
            createdAt: nowMs,
          });
        }
        output.discarded.push(topicId);
      };

      for (const topicId of valid) {
        const id = await summaryId(ctx.slot, topicId);
        if (await already(id)) {
          // An earlier attempt committed it; report what it was.
          const row = await ctx.db
            .select({ status: summaries.status, version: summaries.version })
            .from(summaries)
            .where(eq(summaries.id, id))
            .get();
          if (row?.status === "discarded") output.discarded.push(topicId);
          else {
            output.published.push(topicId);
            if (row?.version === 1) output.formed.push(topicId);
          }
          continue;
        }
        const latest = await ctx.db
          .select({ version: max(summaries.version) })
          .from(summaries)
          .where(and(eq(summaries.topicId, topicId), eq(summaries.status, "published")))
          .get();
        const first = (latest?.version ?? null) === null;
        const draft = await readDraft(deps.blobs, ctx.slot, topicId);
        const verdict = validateDraft({ ...draft, first }, await referenceText(ctx, draft));
        if (!verdict.ok) {
          await discard(topicId);
          continue;
        }
        const value = verdict.value;
        const version = (latest?.version ?? 0) + 1;

        const writes: Parameters<typeof ctx.db.batch>[0][number][] = [
          ctx.db.insert(summaries).values({
            id,
            topicId,
            version,
            status: "published",
            reason: draft.reason,
            writer: draft.provider,
            model: draft.model,
            promptVersion: draft.promptVersion ?? null,
            riskFlags: JSON.stringify(value.riskFlags),
            // False when enrich read no page for it (#45), or for a draft from before it.
            sourceTextRead: draft.sourceTextRead === true,
            slot: ctx.slot,
            createdAt: nowMs,
          }),
          ctx.db.insert(summaryTexts).values(
            value.texts.map((t) => ({
              summaryId: id,
              lang: t.lang,
              title: t.title,
              body: t.body,
            })),
          ),
          // One JSON parameter per chunk, as in compute: D1 allows 100 bound
          // values per statement, and a row here binds two.
          ...chunks([...new Set(value.evidenceEchoIds)]).map((part) =>
            ctx.db.run(sql`INSERT INTO summary_evidence (summary_id, echo_id)
              SELECT ${id}, value FROM json_each(${JSON.stringify(part)})`),
          ),
        ];
        if (first) {
          // validateDraft refuses a first summary without a criterion.
          const lang = draft.languages[0];
          if (value.criterion === undefined || lang === undefined) {
            throw new Error("first summary without a criterion");
          }
          writes.push(
            ctx.db.insert(events).values({
              type: "wave_formed",
              topicId,
              slot: ctx.slot,
              at,
              summaryId: id,
            }),
            ctx.db.insert(predictions).values({
              id: `p${(await sha256(topicId)).slice(0, 24)}`,
              topicId,
              summaryId: id,
              lang,
              criterion: value.criterion,
              hash: await sha256(value.criterion),
              registeredAt: at,
              dueAt: at + settings.reviewWindowDays * DAY_MS,
            }),
          );
        } else {
          writes.push(
            ctx.db.insert(events).values({
              type: "summary_updated",
              topicId,
              slot: ctx.slot,
              at,
              summaryId: id,
            }),
          );
        }
        const [head, ...rest] = writes;
        if (head) await ctx.db.batch([head, ...rest]);
        output.published.push(topicId);
        if (first) output.formed.push(topicId);
      }

      for (const { topicId } of discarded) await discard(topicId);
      return output;
    },
  };
}
