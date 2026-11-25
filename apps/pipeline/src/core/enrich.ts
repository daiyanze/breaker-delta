/**
 * The enrich step (M2-04, #45): fetch the text of a few evidence pages for
 * each wave the select step chose, so the summarize call reads more than
 * titles and excerpts.
 *
 * 1. **Waves.** The `selected` list of this slot's select output, in order.
 *    Waves left waiting are not fetched.
 * 2. **Pages.** For each wave, at most `enrichPagesPerTopic` of the echoes
 *    summarize will offer (first seen in this slot or earlier), one per
 *    fetch group first, oldest first (`pickPages`), then the rest oldest
 *    first.
 * 3. **Budget.** At most `enrichPagesPerRun` fetches in the run, failed ones
 *    included, given out in select's order; the waves after it is spent get
 *    no page. Each page is one attempt of `fetchTimeoutSeconds`, reading at
 *    most `enrichPageMaxKB` and keeping at most `enrichPageMaxChars` of text
 *    (`fetchPage`).
 * 4. **Store.** A wave with at least one page read gets the blob
 *    `enrichKey(slot, topicId)`: each page's echo id and text. A wave with
 *    none is `unread`, and summarize writes it from titles and excerpts,
 *    marked as without source text (`summaries.source_text_read`). A failed
 *    fetch never fails the step.
 *
 * Fetched content is data (invariant 6): the text goes to the blob only,
 * under `raw/<slot>/`, so retention removes it with the scan's raw responses
 * (`rawRetentionDays`), and from there only into summarize's tool-less model
 * call. The output holds topic ids and counts, never URLs, text or fetch
 * errors.
 *
 * A retried or resumed attempt fetches again and replaces the blobs; a wave
 * it leaves unread loses the blob an earlier attempt stored.
 */
import { echoes } from "@bd/db";
import type { Blobs } from "@bd/ports";
import { and, asc, eq, lte } from "drizzle-orm";
import { fetchPage } from "../sources/page.ts";
import type { Step } from "./runner.ts";
import type { SelectOutput } from "./select.ts";
import { readSettings } from "./settings.ts";

export interface EnrichDeps {
  blobs: Blobs;
  fetch: typeof fetch;
}

/** What the step returns; the runner stores it in `run_steps.output`. Ids and counts only. */
export interface EnrichOutput {
  /** Waves with page text at `enrichKey(slot, topicId)`, in select's order. */
  read: { topicId: string; pages: number }[];
  /** Selected waves with no page text: every fetch failed, none was due, or the budget was spent. */
  unread: string[];
  /** Pages this run tried to fetch; at most `enrichPagesPerRun`. */
  fetched: number;
  /** Of those, the ones that gave no text. */
  failed: number;
}

/** One wave's page texts as stored in the blob. */
export interface Enriched {
  topicId: string;
  pages: { echoId: string; text: string }[];
}

export function enrichKey(slot: string, topicId: string): string {
  return `raw/${slot}/enrich/${topicId}.json`;
}

/** A wave's stored page texts by echo id; empty when it has none. */
export async function readEnriched(
  blobs: Blobs,
  slot: string,
  topicId: string,
): Promise<Map<string, string>> {
  const bytes = await blobs.get(enrichKey(slot, topicId));
  if (bytes === null) return new Map();
  const stored = JSON.parse(new TextDecoder().decode(bytes)) as Enriched;
  return new Map(stored.pages.map((p) => [p.echoId, p.text]));
}

/**
 * Which echoes' pages to fetch, at most `max`: the oldest echo of each fetch
 * group first, in the order given, then the others in the order given. Pure.
 */
export function pickPages(list: readonly { id: string; groupId: string }[], max: number): string[] {
  const seen = new Set<string>();
  const firsts: string[] = [];
  const rest: string[] = [];
  for (const e of list) {
    if (seen.has(e.groupId)) rest.push(e.id);
    else {
      seen.add(e.groupId);
      firsts.push(e.id);
    }
  }
  return [...firsts, ...rest].slice(0, Math.max(0, max));
}

export function enrichStep(deps: EnrichDeps): Step {
  return {
    name: "enrich",
    async run(ctx): Promise<EnrichOutput> {
      const { settings } = await readSettings(ctx.db, ctx.now());
      const output: EnrichOutput = { read: [], unread: [], fetched: 0, failed: 0 };
      const options = {
        timeoutMs: settings.fetchTimeoutSeconds * 1000,
        maxBytes: settings.enrichPageMaxKB * 1024,
        maxChars: settings.enrichPageMaxChars,
        fetch: deps.fetch,
      };
      // Read here rather than with summarize's `outputOf`, which imports this file.
      const select = ctx.outputs.get("select") as SelectOutput | null | undefined;
      if (!select) throw new Error(`${ctx.slot}: no select output`);
      for (const { topicId } of select.selected) {
        // Ordered as summarize offers them, so every page is of an offered echo.
        const offered = await ctx.db
          .select({ id: echoes.id, groupId: echoes.groupId, url: echoes.url })
          .from(echoes)
          .where(and(eq(echoes.topicId, topicId), lte(echoes.firstSlot, ctx.slot)))
          .orderBy(asc(echoes.firstSeenAt), asc(echoes.id));
        const budget = Math.max(0, settings.enrichPagesPerRun - output.fetched);
        const picked = pickPages(offered, Math.min(settings.enrichPagesPerTopic, budget));
        const urls = new Map(offered.map((e) => [e.id, e.url]));
        const results = await Promise.all(
          picked.map(async (echoId) => ({
            echoId,
            result: await fetchPage(urls.get(echoId) ?? "", options),
          })),
        );
        output.fetched += picked.length;
        const pages: Enriched["pages"] = [];
        for (const { echoId, result } of results) {
          if (result.ok) pages.push({ echoId, text: result.text });
          else output.failed++;
        }
        const key = enrichKey(ctx.slot, topicId);
        if (pages.length === 0) {
          await deps.blobs.delete(key);
          output.unread.push(topicId);
          continue;
        }
        const stored: Enriched = { topicId, pages };
        await deps.blobs.put(key, JSON.stringify(stored), "application/json");
        output.read.push({ topicId, pages: pages.length });
      }
      return output;
    },
  };
}
