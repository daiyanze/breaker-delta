/**
 * The ingest step (M1-11, #27): read the raw responses the scan step stored
 * for this slot, turn their items into echoes, and record each echo's heat
 * for the run.
 *
 * For each item, in the order of the scan's `fetched` groups and then the
 * group's responses:
 *
 * 1. **Normalise.** The URL goes through `normaliseUrl` (`@bd/core`, M1-09).
 *    An item whose URL it rejects is dropped (`badUrl`).
 * 2. **Keyword filters.** `keywordsInclude` and `keywordsExclude` from
 *    settings (invariant 9) are matched against the title, ignoring case and
 *    width (NFKC). With an include list, a title must contain one of its
 *    words; a title that contains an exclude word is dropped either way.
 *    Blank words are ignored, so `[""]` filters nothing. (`filtered`)
 * 3. **De-duplicate by URL.** `echoes.url` is unique, so one URL is one echo,
 *    owned by the group that first listed it. Of the run's items with one
 *    URL, one is kept: the owning group's for a known echo, else the first
 *    read; the others are dropped (`duplicate`). A known URL that only other
 *    groups listed this run gets no heat record: heat is each source's own
 *    count, and two sources' counts are not on one scale (`otherGroup`).
 * 4. **New or known.** A new URL becomes an echo (first seen now, in this
 *    slot, not yet assigned to a topic). Every echo kept, new or known, gets
 *    one `echo_metrics` row for the slot with the item's heat (0 when the
 *    source has none). So ingesting the same data again in a later run adds
 *    heat rows and no echoes.
 *
 * All writes for the slot are one batch, and each insert ignores a row that
 * is already there (echoes) or replaces it (the slot's heat), so a retried
 * or resumed attempt leaves the same rows as one attempt. Rows travel as one
 * JSON parameter per statement (`json_each`), in chunks: D1 binds at most
 * 100 values per statement and limits the statements per invocation, and a
 * run can have thousands of items.
 *
 * Fetched content is data (invariant 6): titles go to the database only. The
 * step's output holds counts and group ids, and its errors hold this file's
 * own messages, never fetched text.
 */
import { normaliseUrl } from "@bd/core";
import { type Db, echoes } from "@bd/db";
import type { Blobs } from "@bd/ports";
import { sql } from "drizzle-orm";
import { type Adapter, ParseError } from "../sources/adapter.ts";
import type { Step, StepContext } from "./runner.ts";
import { type RawScan, rawKey, type ScanOutput } from "./scan.ts";
import { readSettings } from "./settings.ts";

export interface IngestDeps {
  blobs: Blobs;
  adapters: Readonly<Record<string, Adapter>>;
}

/** What the step returns; the runner stores it in `run_steps.output`. Counts and group ids only. */
export interface IngestOutput {
  /** Items the adapters read from the stored responses. */
  items: number;
  /** Echoes this run created. */
  newEchoes: number;
  /** Echoes that existed before this run and got a heat record. */
  knownEchoes: number;
  /** Items dropped, by reason. */
  dropped: { badUrl: number; filtered: number; duplicate: number; otherGroup: number };
  /** Fetched groups whose stored responses could not be read again (blob gone, no adapter, parse error). */
  unreadable: string[];
}

/** Longest title stored, as `EchoInputSchema` allows. A longer one is cut with an ellipsis. */
export const MAX_TITLE = 500;

/** Rows per statement. Each row is a few hundred bytes of JSON; this keeps a statement well under 1 MB. */
const CHUNK = 500;

const fold = (text: string) => text.normalize("NFKC").toLowerCase();

/** Whether a title passes the keyword filters. Pure; exported for tests. */
export function passesKeywords(
  title: string,
  include: readonly string[],
  exclude: readonly string[],
): boolean {
  const t = fold(title);
  const words = (list: readonly string[]) => list.map((w) => fold(w).trim()).filter((w) => w);
  const inc = words(include);
  if (inc.length > 0 && !inc.some((w) => t.includes(w))) return false;
  return !words(exclude).some((w) => t.includes(w));
}

/** An echo's id, from its normalised URL: the same URL always gets the same id. */
export async function echoId(url: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `e${hex.slice(0, 24)}`;
}

function cut(title: string): string {
  const chars = [...title];
  return chars.length > MAX_TITLE ? `${chars.slice(0, MAX_TITLE - 1).join("")}…` : title;
}

interface Kept {
  url: string;
  groupId: string;
  title: string;
  publishedAt: number | null;
  heat: number;
}

/** Read one group's stored responses again; null when they cannot be read. */
async function readGroup(
  blobs: Blobs,
  adapter: Adapter | undefined,
  slot: string,
  groupId: string,
) {
  if (!adapter) return null;
  const bytes = await blobs.get(rawKey(slot, groupId));
  if (bytes === null) return null;
  try {
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as RawScan;
    return raw.responses.flatMap((r) => adapter.parse(r.body, r.url));
  } catch (err) {
    // A response scan read once should read again; if not, skip the group,
    // naming no fetched text (a JSON or adapter error may quote the body).
    if (err instanceof ParseError || err instanceof SyntaxError) return null;
    throw err;
  }
}

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** The echoes that already hold any of `urls`: id, owning group and first slot. */
async function existing(db: Db, urls: readonly string[]) {
  const found = new Map<string, { id: string; groupId: string; firstSlot: string }>();
  for (const part of chunks(urls)) {
    const rows = await db
      .select({
        id: echoes.id,
        url: echoes.url,
        groupId: echoes.groupId,
        firstSlot: echoes.firstSlot,
      })
      .from(echoes)
      .where(sql`${echoes.url} IN (SELECT value FROM json_each(${JSON.stringify(part)}))`);
    for (const { url, ...echo } of rows) found.set(url, echo);
  }
  return found;
}

export function ingestStep(deps: IngestDeps): Step {
  return {
    name: "ingest",
    async run(ctx: StepContext): Promise<IngestOutput> {
      const scan = ctx.outputs.get("scan") as ScanOutput | undefined;
      if (!scan) throw new Error("ingest runs after scan: no scan output for this slot");
      const nowMs = ctx.now();
      const { settings } = await readSettings(ctx.db, nowMs);

      const output: IngestOutput = {
        items: 0,
        newEchoes: 0,
        knownEchoes: 0,
        dropped: { badUrl: 0, filtered: 0, duplicate: 0, otherGroup: 0 },
        unreadable: [],
      };

      // Every item kept so far, by normalised URL, in the order they were read.
      const byUrl = new Map<string, Kept[]>();
      for (const groupId of scan.fetched) {
        const items = await readGroup(deps.blobs, deps.adapters[groupId], ctx.slot, groupId);
        if (items === null) {
          output.unreadable.push(groupId);
          continue;
        }
        output.items += items.length;
        for (const item of items) {
          const url = normaliseUrl(item.url);
          if (url === null) {
            output.dropped.badUrl++;
            continue;
          }
          if (!passesKeywords(item.title, settings.keywordsInclude, settings.keywordsExclude)) {
            output.dropped.filtered++;
            continue;
          }
          const seen = byUrl.get(url) ?? [];
          seen.push({
            url,
            groupId,
            title: cut(item.title),
            publishedAt: item.publishedAt,
            heat: item.heat ?? 0,
          });
          byUrl.set(url, seen);
        }
      }

      const known = await existing(ctx.db, [...byUrl.keys()]);
      const created: (Kept & { id: string })[] = [];
      const metrics: { id: string; heat: number }[] = [];
      for (const [url, seen] of byUrl) {
        const echo = known.get(url);
        // A known URL takes its heat from the group that owns it; a new one
        // belongs to the group that listed it first.
        const item = echo ? seen.find((s) => s.groupId === echo.groupId) : seen[0];
        if (!item) {
          output.dropped.otherGroup += seen.length;
          continue;
        }
        output.dropped.duplicate += seen.length - 1;
        if (echo) {
          // An earlier attempt of this run already created it: still new to the run.
          if (echo.firstSlot === ctx.slot) output.newEchoes++;
          else output.knownEchoes++;
          metrics.push({ id: echo.id, heat: item.heat });
          continue;
        }
        const id = await echoId(url);
        created.push({ ...item, id });
        metrics.push({ id, heat: item.heat });
        output.newEchoes++;
      }

      const writes = [
        ...chunks(created).map((part) =>
          ctx.db.run(sql`INSERT INTO echoes
              (id, url, group_id, title, published_at, first_seen_at, first_slot)
            SELECT json_extract(value, '$.id'), json_extract(value, '$.url'),
              json_extract(value, '$.groupId'), json_extract(value, '$.title'),
              json_extract(value, '$.publishedAt'), ${nowMs}, ${ctx.slot}
            FROM json_each(${JSON.stringify(part)}) WHERE true
            ON CONFLICT (url) DO NOTHING`),
        ),
        ...chunks(metrics).map((part) =>
          ctx.db.run(sql`INSERT INTO echo_metrics (echo_id, slot, heat, seen_at)
            SELECT json_extract(value, '$.id'), ${ctx.slot}, json_extract(value, '$.heat'), ${nowMs}
            FROM json_each(${JSON.stringify(part)}) WHERE true
            ON CONFLICT (echo_id, slot) DO UPDATE SET heat = excluded.heat, seen_at = excluded.seen_at`),
        ),
      ];
      const [first, ...rest] = writes;
      if (first) await ctx.db.batch([first, ...rest]);
      return output;
    },
  };
}
