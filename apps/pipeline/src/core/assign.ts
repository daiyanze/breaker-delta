/**
 * The assign step (M1-16, #32): give every echo that has no topic yet one
 * topic, either an existing one the model picks from a shortlist or a new one
 * it names. The model proposes; this step decides what is stored (invariant
 * 1, ADR 0003).
 *
 * 1. **Echoes.** Every echo with no topic, oldest first. That is this run's
 *    new echoes and any an earlier run could not place, so a failed echo is
 *    tried again next run.
 * 2. **Pool.** Topics not merged away whose latest echo (or, with none, their
 *    creation) is at most `assignActivityDays` old. Topics this run creates
 *    join the pool for later batches.
 * 3. **Batches.** `assignBatchSize` echoes per model call. For each batch the
 *    shortlist is at most `assignShortlistSize` pool topics, ranked by words
 *    their name and aliases share with the batch's titles, then by latest
 *    activity (`shortlist`).
 * 4. **Validate.** An assignment is kept only when its echo is in the batch
 *    and named once, and its topic is in that batch's shortlist or is a new
 *    topic with a non-blank name (`validateAssignments`). Everything else is
 *    rejected, and its echo stays without a topic for the next run. A batch
 *    whose model call fails leaves all its echoes for the next run.
 * 5. **Write.** One batch of statements per model call: the new topics, each
 *    with a stable slug made from its name (`slugBase`, a number added when
 *    taken), then the echoes' topic. An echo's topic is only set while it is
 *    still empty, so an echo never gets a second assignment.
 *
 * A retried or resumed attempt starts again from the echoes still without a
 * topic, so it never assigns an echo twice.
 *
 * Fetched content is data (invariant 6): titles and excerpts go only into the
 * tool-less model call. The model refers to echoes and topics by ID; it never
 * writes a URL or a source (invariant 2). The step's output holds counts, and
 * a failed model call's error is not kept, since it may quote the model's
 * answer.
 */
import { AssignResultSchema } from "@bd/contracts";
import { type Db, echoes, topicAliases, topics } from "@bd/db";
import { type DriverEcho, type DriverTopic, type ModelDriver, words } from "@bd/judge";
import { asc, eq, isNull, sql } from "drizzle-orm";
import type { Step, StepContext } from "./runner.ts";
import { readSettings } from "./settings.ts";

export interface AssignDeps {
  driver: ModelDriver;
}

/** What the step returns; the runner stores it in `run_steps.output`. Counts only. */
export interface AssignOutput {
  /** Echoes without a topic when the step started. */
  echoes: number;
  /** Echoes given a topic. */
  assigned: number;
  /** Topics created. */
  newTopics: number;
  /** Assignments rejected by validation (their echoes wait for the next run). */
  rejected: number;
  /** Model calls that failed (their echoes wait for the next run). */
  failedBatches: number;
  /** Echoes still without a topic when the step ended. */
  unassigned: number;
}

/** A topic that can be shortlisted. */
export interface PoolTopic {
  id: string;
  name: string;
  aliases: string[];
  /** Epoch ms of its latest echo, or its creation when it has none. */
  lastActive: number;
}

/** Longest slug made from a name; a number may follow. */
export const MAX_SLUG = 60;

/**
 * At most `size` topics for the batch whose titles are given: most words
 * shared between a topic's name or aliases and the titles first, then the
 * most recently active, then by id. Pure; exported for tests.
 */
export function shortlist(
  pool: readonly PoolTopic[],
  titles: readonly string[],
  size: number,
): PoolTopic[] {
  const batch = new Set(titles.flatMap((t) => [...words(t)]));
  const scored = pool.map((topic) => {
    const own = new Set([topic.name, ...topic.aliases].flatMap((n) => [...words(n)]));
    let score = 0;
    for (const w of own) if (batch.has(w)) score++;
    return { topic, score };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.topic.lastActive - a.topic.lastActive ||
      (a.topic.id < b.topic.id ? -1 : a.topic.id > b.topic.id ? 1 : 0),
  );
  return scored.slice(0, size).map((s) => s.topic);
}

/** What validation keeps for one echo. */
export type Placement = { topicId: string } | { newTopic: string };

/**
 * The assignments code accepts from a model answer, by echo id, and how many
 * it rejected. Rejected: an answer that fails the contract (all of it), an
 * echo not in the batch, an echo named more than once (every one of its
 * assignments), a topic not in the shortlist, a blank new topic name. Pure;
 * exported for tests.
 */
export function validateAssignments(
  echoIds: readonly string[],
  shortlistIds: readonly string[],
  answer: unknown,
): { placements: Map<string, Placement>; rejected: number } {
  const parsed = AssignResultSchema.safeParse(answer);
  if (!parsed.success) return { placements: new Map(), rejected: echoIds.length };
  const inBatch = new Set(echoIds);
  const offered = new Set(shortlistIds);
  const named = new Map<string, number>();
  for (const a of parsed.data.assignments) named.set(a.echoId, (named.get(a.echoId) ?? 0) + 1);
  const placements = new Map<string, Placement>();
  let rejected = 0;
  for (const a of parsed.data.assignments) {
    if (!inBatch.has(a.echoId) || named.get(a.echoId) !== 1) {
      rejected++;
      continue;
    }
    if ("topicId" in a) {
      if (offered.has(a.topicId)) placements.set(a.echoId, { topicId: a.topicId });
      else rejected++;
      continue;
    }
    const name = a.newTopic.name.trim();
    if (name) placements.set(a.echoId, { newTopic: name });
    else rejected++;
  }
  return { placements, rejected };
}

/**
 * The part of a slug a name gives: lower-case ASCII letters and digits joined
 * by single hyphens, accents dropped, at most `MAX_SLUG` characters. Empty
 * when the name has none (for example, all CJK). Pure; exported for tests.
 */
export function slugBase(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG)
    .replace(/^-+|-+$/g, "");
}

function newTopicId(): string {
  return `t${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

/** Topics that may be shortlisted at `since` or later, with their aliases. */
async function loadPool(db: Db, since: number): Promise<PoolTopic[]> {
  const lastActive = sql<number>`max(${topics.createdAt}, coalesce(max(${echoes.firstSeenAt}), 0))`;
  const rows = await db
    .select({ id: topics.id, name: topics.name, lastActive })
    .from(topics)
    .leftJoin(echoes, eq(echoes.topicId, topics.id))
    .where(isNull(topics.mergedInto))
    .groupBy(topics.id)
    .having(sql`${lastActive} >= ${since}`);
  if (rows.length === 0) return [];
  const aliases = await db
    .select({ topicId: topicAliases.topicId, alias: topicAliases.alias })
    .from(topicAliases)
    .where(
      sql`${topicAliases.topicId} IN (SELECT value FROM json_each(${JSON.stringify(rows.map((r) => r.id))}))`,
    );
  const byTopic = new Map<string, string[]>();
  for (const a of aliases) byTopic.set(a.topicId, [...(byTopic.get(a.topicId) ?? []), a.alias]);
  return rows.map((r) => ({ ...r, aliases: (byTopic.get(r.id) ?? []).sort() }));
}

/** A free slug for `name`, given the slugs taken so far (updated). */
async function freeSlug(db: Db, name: string, id: string, taken: Set<string>): Promise<string> {
  const base = slugBase(name) || id;
  // The base holds only [a-z0-9-], so it has no LIKE wildcards.
  const rows = await db
    .select({ slug: topics.slug })
    .from(topics)
    .where(sql`${topics.slug} = ${base} OR ${topics.slug} LIKE ${`${base}-%`}`);
  for (const r of rows) taken.add(r.slug);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

export function assignStep(deps: AssignDeps): Step {
  return {
    name: "assign",
    async run(ctx: StepContext): Promise<AssignOutput> {
      const nowMs = ctx.now();
      const { settings } = await readSettings(ctx.db, nowMs);
      const pending = await ctx.db
        .select({ id: echoes.id, title: echoes.title, excerpt: echoes.excerpt })
        .from(echoes)
        .where(isNull(echoes.topicId))
        .orderBy(asc(echoes.firstSeenAt), asc(echoes.id));
      const pool = await loadPool(ctx.db, nowMs - settings.assignActivityDays * 86_400_000);
      const takenSlugs = new Set<string>();

      const output: AssignOutput = {
        echoes: pending.length,
        assigned: 0,
        newTopics: 0,
        rejected: 0,
        failedBatches: 0,
        unassigned: pending.length,
      };

      for (let i = 0; i < pending.length; i += settings.assignBatchSize) {
        const batch = pending.slice(i, i + settings.assignBatchSize);
        const offered = shortlist(
          pool,
          batch.map((e) => e.title),
          settings.assignShortlistSize,
        );
        const input = {
          echoes: batch.map(
            (e): DriverEcho =>
              e.excerpt
                ? { id: e.id, title: e.title, summary: e.excerpt }
                : { id: e.id, title: e.title },
          ),
          topics: offered.map(
            (t): DriverTopic => ({
              id: t.id,
              name: t.name,
              ...(t.aliases.length > 0 ? { aliases: t.aliases } : {}),
            }),
          ),
        };
        let answer: unknown;
        try {
          answer = (await deps.driver.assign(input)).value;
        } catch {
          // The error may quote the model's answer: count it, keep nothing.
          output.failedBatches++;
          continue;
        }
        const { placements, rejected } = validateAssignments(
          batch.map((e) => e.id),
          offered.map((t) => t.id),
          answer,
        );
        output.rejected += rejected;
        if (placements.size === 0) continue;

        // One topic per distinct new name in the batch.
        const created = new Map<string, { id: string; slug: string; name: string }>();
        const rows: { echoId: string; topicId: string }[] = [];
        for (const [echoId, p] of placements) {
          if ("topicId" in p) {
            rows.push({ echoId, topicId: p.topicId });
            continue;
          }
          let topic = created.get(p.newTopic);
          if (!topic) {
            const id = newTopicId();
            topic = {
              id,
              name: p.newTopic,
              slug: await freeSlug(ctx.db, p.newTopic, id, takenSlugs),
            };
            created.set(p.newTopic, topic);
          }
          rows.push({ echoId, topicId: topic.id });
        }
        const newTopics = [...created.values()];
        const update = ctx.db.run(sql`UPDATE echoes SET topic_id = (
            SELECT json_extract(value, '$.topicId') FROM json_each(${JSON.stringify(rows)})
            WHERE json_extract(value, '$.echoId') = echoes.id)
          WHERE topic_id IS NULL AND id IN (
            SELECT json_extract(value, '$.echoId') FROM json_each(${JSON.stringify(rows)}))`);
        if (newTopics.length > 0) {
          await ctx.db.batch([
            ctx.db.run(sql`INSERT INTO topics (id, slug, name, state, created_at)
              SELECT json_extract(value, '$.id'), json_extract(value, '$.slug'),
                json_extract(value, '$.name'), 'echo', ${nowMs}
              FROM json_each(${JSON.stringify(newTopics)})`),
            update,
          ]);
        } else {
          await ctx.db.batch([update]);
        }
        output.assigned += rows.length;
        output.unassigned -= rows.length;
        output.newTopics += newTopics.length;
        for (const t of newTopics) pool.push({ ...t, aliases: [], lastActive: nowMs });
        // An offered topic that got an echo is active now.
        for (const t of offered) if (rows.some((r) => r.topicId === t.id)) t.lastActive = nowMs;
      }
      return output;
    },
  };
}
