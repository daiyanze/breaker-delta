/**
 * The compute step (M1-13, #29): each live topic's state, wave height and
 * rank for this run, written as one `wave_points` row per topic, and the
 * topic's state and dates updated to match. Every number comes from
 * `@bd/core` (invariant 1); this step only reads the inputs and writes the
 * results.
 *
 * 1. **Time.** The slot's start (`slotStart`), not the clock, so a retried
 *    or resumed attempt computes the same numbers.
 * 2. **Topics.** Not merged away, and up, or with an echo first seen in this
 *    slot or the `calmAfterDays` before it, or already given a point in this
 *    slot. A flat wave or an echo topic with no recent echo gets no new point;
 *     its last one stands, so an echo topic whose echoes are all older never
 *    forms, even if a merge brings it to the threshold. The last clause keeps a retry's topics the same as
 *    the first attempt's, after that attempt moved a wave to flat.
 * 3. **Echoes.** All of each topic's echoes from this slot or earlier, each
 *    with the heat of its latest `echo_metrics` row from this slot or
 *    earlier, 0 when it has none.
 * 4. **Rules.** `nextTopicStatus` gives the state, `waveHeight` the height,
 *    `rankByHeight` the rank among up topics (null for the rest). Under
 *    `heatNormalisation: "group"`, a group's reference heat is
 *    `groupHeatReferences` over every echo first seen in the same window as
 *    step 2, whatever its topic.
 * 5. **Write.** One batch: every point (written again with the same values on
 *    a retry), and the topics whose state or dates changed.
 *
 * Setting `formed_at` here is not the wave forming of invariant 5: that is
 * the commit step's batch of first summary, `wave_formed` event and
 * prediction (#34; owner's decision, 2026-11-24). The board shows a wave
 * before its summary exists.
 *
 * Re-running the step for a slot, with the same settings, writes the same
 * rows and returns the same output. The output holds counts and topic ids only.
 */
import {
  countIndependentSources,
  type EchoLike,
  groupHeatReferences,
  nextTopicStatus,
  rankByHeight,
  slotStart,
  type TopicState,
  waveHeight,
} from "@bd/core";
import { type Db, echoes, topics } from "@bd/db";
import { asc, eq, sql } from "drizzle-orm";
import type { Step } from "./runner.ts";
import { readSettings } from "./settings.ts";

/** What the step returns; the runner stores it in `run_steps.output`. */
export interface ComputeOutput {
  /** Topics given a point in this slot. */
  topics: number;
  /** Of those, the ones up after this run. */
  up: number;
  /** Topics that became a wave in this slot. */
  formed: string[];
  /** Waves that went flat in this slot. */
  wentFlat: string[];
}

const DAY_MS = 86_400_000;
/** Ids per `json_each` parameter, as in ingest. */
const CHUNK = 500;

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** The heat of an echo's latest metrics row from `slot` or earlier; 0 when none. */
const heatAt = (slot: string) =>
  sql<number>`COALESCE((SELECT m.heat FROM echo_metrics m
    WHERE m.echo_id = ${echoes.id} AND m.slot <= ${slot}
    ORDER BY m.slot DESC LIMIT 1), 0)`;

interface TopicRow {
  id: string;
  state: TopicState;
  formedAt: number | null;
  wentFlatAt: number | null;
}

async function liveTopics(db: Db, slot: string, since: number): Promise<TopicRow[]> {
  return db
    .select({
      id: topics.id,
      state: topics.state,
      formedAt: topics.formedAt,
      wentFlatAt: topics.wentFlatAt,
    })
    .from(topics)
    .where(
      sql`${topics.mergedInto} IS NULL AND (
        ${topics.state} = 'up'
        OR EXISTS (SELECT 1 FROM echoes e WHERE e.topic_id = ${topics.id}
          AND e.first_slot <= ${slot} AND e.first_seen_at >= ${since})
        OR EXISTS (SELECT 1 FROM wave_points w WHERE w.slot = ${slot}
          AND w.topic_id = ${topics.id}))`,
    )
    .orderBy(asc(topics.id));
}

async function echoesOf(db: Db, slot: string, ids: readonly string[]) {
  const byTopic = new Map<string, EchoLike[]>();
  for (const part of chunks(ids)) {
    const rows = await db
      .select({
        id: echoes.id,
        topicId: echoes.topicId,
        groupId: echoes.groupId,
        firstSeenAt: echoes.firstSeenAt,
        heat: heatAt(slot),
      })
      .from(echoes)
      .where(
        sql`${echoes.topicId} IN (SELECT value FROM json_each(${JSON.stringify(part)}))
          AND ${echoes.firstSlot} <= ${slot}`,
      )
      .orderBy(asc(echoes.id));
    for (const { topicId, ...echo } of rows) {
      if (topicId === null) continue;
      const list = byTopic.get(topicId);
      if (list) list.push(echo);
      else byTopic.set(topicId, [echo]);
    }
  }
  return byTopic;
}

/** Every echo first seen in the window, any topic or none: the heat references' input. */
async function windowEchoes(db: Db, slot: string, since: number) {
  return db
    .select({ groupId: echoes.groupId, heat: heatAt(slot) })
    .from(echoes)
    .where(sql`${echoes.firstSlot} <= ${slot} AND ${echoes.firstSeenAt} >= ${since}`);
}

export function computeStep(): Step {
  return {
    name: "compute",
    async run(ctx): Promise<ComputeOutput> {
      const { settings } = await readSettings(ctx.db, ctx.now());
      const nowMs = slotStart(ctx.slot);
      const since = nowMs - settings.calmAfterDays * DAY_MS;
      const live = await liveTopics(ctx.db, ctx.slot, since);
      const byTopic = await echoesOf(
        ctx.db,
        ctx.slot,
        live.map((t) => t.id),
      );
      const params = {
        waveThreshold: settings.waveThreshold,
        calmAfterDays: settings.calmAfterDays,
        halfLifeHours: settings.halfLifeHours,
        heightScale: settings.heightScale,
        sourceBonus: settings.sourceBonus,
        maxEchoesPerGroup: settings.maxEchoesPerGroup,
        heatNormalisation: settings.heatNormalisation,
      };
      const reference =
        settings.heatNormalisation === "group"
          ? groupHeatReferences(
              await windowEchoes(ctx.db, ctx.slot, since),
              settings.heatReferencePercentile,
            )
          : undefined;

      const results = live.map((topic) => {
        const list = byTopic.get(topic.id) ?? [];
        const next = nextTopicStatus(topic, list, nowMs, params);
        return {
          topic,
          next,
          height: waveHeight(list, nowMs, params, reference),
          sourceCount: countIndependentSources(list),
          echoCount: list.length,
        };
      });
      const ranks = rankByHeight(
        results
          .filter((r) => r.next.state === "up")
          .map((r) => ({ id: r.topic.id, height: r.height })),
      );

      const points = results.map((r) => ({
        topicId: r.topic.id,
        state: r.next.state,
        height: r.height,
        rank: ranks.get(r.topic.id) ?? null,
        sourceCount: r.sourceCount,
        echoCount: r.echoCount,
      }));
      const changed = results.filter(
        (r) =>
          r.next.state !== r.topic.state ||
          r.next.formedAt !== r.topic.formedAt ||
          r.next.wentFlatAt !== r.topic.wentFlatAt,
      );
      const writes = [
        // One JSON parameter per chunk: D1 allows few bound parameters per statement.
        ...chunks(points).map((part) =>
          ctx.db.run(sql`INSERT INTO wave_points
              (slot, topic_id, state, height, rank, source_count, echo_count)
            SELECT ${ctx.slot}, json_extract(value, '$.topicId'), json_extract(value, '$.state'),
              json_extract(value, '$.height'), json_extract(value, '$.rank'),
              json_extract(value, '$.sourceCount'), json_extract(value, '$.echoCount')
            FROM json_each(${JSON.stringify(part)}) WHERE true
            ON CONFLICT (slot, topic_id) DO UPDATE SET state = excluded.state,
              height = excluded.height, rank = excluded.rank,
              source_count = excluded.source_count, echo_count = excluded.echo_count`),
        ),
        ...changed.map((r) =>
          ctx.db
            .update(topics)
            .set({ state: r.next.state, formedAt: r.next.formedAt, wentFlatAt: r.next.wentFlatAt })
            .where(eq(topics.id, r.topic.id)),
        ),
      ];
      const [first, ...rest] = writes;
      if (first) await ctx.db.batch([first, ...rest]);

      return {
        topics: points.length,
        up: ranks.size,
        formed: results.filter((r) => r.next.formedAt === nowMs).map((r) => r.topic.id),
        wentFlat: results
          .filter((r) => r.next.state === "flat" && r.next.wentFlatAt === nowMs)
          .map((r) => r.topic.id),
      };
    },
  };
}
