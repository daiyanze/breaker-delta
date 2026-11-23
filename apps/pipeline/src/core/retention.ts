/**
 * The retention step (M1-22, #38): remove echoes that never joined a wave,
 * and scans' raw responses, once they are older than their settings window
 * (`echoRetentionDays`, `rawRetentionDays`; invariant 9). Meant to run last
 * in a run, after everything that reads them.
 *
 * **Echoes.** An echo is removed, with its `echo_metrics` rows, when every
 * one of these holds:
 *
 * - No sighting of it has been recorded for longer than the window: its
 *   `first_seen_at` and its latest `echo_metrics.seen_at` are both older
 *   than the cutoff. Ingest records a sighting only when the group that
 *   owns the echo lists it and its title passes the keyword filters (#27).
 *   So an echo only another group still lists is removed, and the next
 *   ingest creates it again (same id, no topic) under whichever group
 *   lists it first; an echo whose title the desk now filters out is
 *   removed too.
 * - Its topic, if it has one, never became a wave. A topic was a wave when
 *   its state is `up` or `flat`, it has a `formed_at`, a `wave_points` row
 *   says `up` or `flat`, or it has a `wave_formed` event. Any one is enough.
 * - No summary cites it (`summary_evidence`), so published evidence keeps
 *   its echo (invariant 4).
 * - No topic edit names it. A merge or a split writes one row per echo it
 *   moves, so an echo that left a wave topic is kept, and the audit trail
 *   keeps pointing at a row.
 *
 * Nothing else is deleted: topics, summaries, events, predictions, verdicts,
 * corrections and wave points stay (invariants 4 and 5). The schema has no
 * foreign keys (`docs/schema.md`), so nothing cascades either.
 *
 * **Raw responses.** A blob `raw/<slot>/<group>.json` (`rawKey`) is removed
 * once its slot started longer ago than `rawRetentionDays`. Keys under
 * `raw/` whose second part is not a slot id are left alone.
 *
 * The cutoffs come from the step's clock (`ctx.now()`). Both removals are
 * safe to repeat: a retried or resumed attempt removes what is still there.
 */
import { echoes } from "@bd/db";
import type { Blobs } from "@bd/ports";
import { sql } from "drizzle-orm";
import type { Step } from "./runner.ts";
import { slotStart } from "./scan.ts";
import { readSettings } from "./settings.ts";

export interface RetentionDeps {
  blobs: Blobs;
}

/** What the step returns; the runner stores it in `run_steps.output`. Counts only. */
export interface RetentionOutput {
  echoesRemoved: number;
  rawRemoved: number;
}

const DAY = 86_400_000;

/** Ids per delete statement, passed as one JSON parameter (D1 binds at most 100 values). */
const CHUNK = 500;

const SLOT_ID = /^\d{8}T\d{4}$/;

export function retentionStep(deps: RetentionDeps): Step {
  return {
    name: "retention",
    async run(ctx): Promise<RetentionOutput> {
      const nowMs = ctx.now();
      const { settings } = await readSettings(ctx.db, nowMs);

      const echoCutoff = nowMs - settings.echoRetentionDays * DAY;
      const expired = await ctx.db
        .select({ id: echoes.id })
        .from(echoes)
        .where(sql`${echoes.firstSeenAt} < ${echoCutoff}
          AND NOT EXISTS (SELECT 1 FROM echo_metrics m
            WHERE m.echo_id = ${echoes.id} AND m.seen_at >= ${echoCutoff})
          AND NOT EXISTS (SELECT 1 FROM summary_evidence s WHERE s.echo_id = ${echoes.id})
          AND NOT EXISTS (SELECT 1 FROM topic_edits t WHERE t.echo_id = ${echoes.id})
          AND (${echoes.topicId} IS NULL OR ${echoes.topicId} NOT IN (
            SELECT id FROM topics WHERE state IN ('up', 'flat') OR formed_at IS NOT NULL
            UNION SELECT topic_id FROM wave_points WHERE state IN ('up', 'flat')
            UNION SELECT topic_id FROM events WHERE type = 'wave_formed'))`);

      const ids = expired.map((e) => e.id);
      const writes = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const part = JSON.stringify(ids.slice(i, i + CHUNK));
        writes.push(
          ctx.db.run(sql`DELETE FROM echo_metrics
            WHERE echo_id IN (SELECT value FROM json_each(${part}))`),
          ctx.db.run(sql`DELETE FROM echoes WHERE id IN (SELECT value FROM json_each(${part}))`),
        );
      }
      const [first, ...rest] = writes;
      // One batch: an echo and its heat records go together.
      if (first) await ctx.db.batch([first, ...rest]);

      const rawCutoff = nowMs - settings.rawRetentionDays * DAY;
      let rawRemoved = 0;
      for (const key of await deps.blobs.list("raw/")) {
        const slot = key.split("/")[1] ?? "";
        if (!SLOT_ID.test(slot) || slotStart(slot) >= rawCutoff) continue;
        await deps.blobs.delete(key);
        rawRemoved++;
      }

      return { echoesRemoved: ids.length, rawRemoved };
    },
  };
}
