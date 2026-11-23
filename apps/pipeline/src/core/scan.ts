/**
 * The scan step (M1-10, #26): decide which fetch groups are due, fetch them
 * in parallel, store the raw responses, and write one `scan_results` row
 * per group it tried.
 *
 * - **Due.** A group is due when its `minIntervalMinutes` (the group config)
 *   has passed since the slot of its last good scan, measured slot start to
 *   slot start, or when it has never been scanned well. 0 means every run.
 *   A group that is not due gets no row: it is not missing.
 * - **No adapter.** A group without an adapter in `ADAPTERS` is not fetched
 *   yet (M1-06, M1-07). It gets no row either, and is listed in the output.
 * - **Fetched or missing.** A group is fetched when at least one of its URLs
 *   answered with a body its adapter can read; a bundle with one dead feed
 *   still counts. Otherwise it is missing: a row with `ok = false`. Neither
 *   throws, so one failing group cannot stop the others or the run.
 * - **Raw responses.** A fetched group's readable responses go to one blob,
 *   `rawKey(slot, groupId)`, which ingest (M1-11) reads and parses again.
 *
 * Fetch budgets come from settings (invariant 9). Every row of the slot is
 * written in one batch that first removes the slot's earlier rows, so a
 * retried or resumed attempt leaves one row per group; a group missing on
 * that attempt also loses the raw blob an earlier one stored.
 *
 * Fetched content is data (invariant 6): bodies go to the blob only. The
 * step's output and `scan_results.error` hold ids, counts, statuses and
 * this file's own messages, never fetched text.
 */
import { type Db, scanResults } from "@bd/db";
import type { Blobs } from "@bd/ports";
import { and, eq, lt, max } from "drizzle-orm";
import { type Adapter, ParseError } from "../sources/adapter.ts";
import { type FetchResult, fetchSource } from "../sources/http.ts";
import type { LaunchGroup } from "../sources/launch-groups.ts";
import type { Step } from "./runner.ts";
import { readSettings } from "./settings.ts";

export interface ScanDeps {
  blobs: Blobs;
  fetch: typeof fetch;
  groups: readonly LaunchGroup[];
  adapters: Readonly<Record<string, Adapter>>;
  /** For tests: how a retry waits. */
  sleep?: (ms: number) => Promise<void>;
}

/** What the step returns; the runner stores it in `run_steps.output`. Group ids only. */
export interface ScanOutput {
  /** Scanned well; their raw responses are at `rawKey(slot, id)`. */
  fetched: string[];
  /** Due, but no URL gave a readable response. */
  missing: string[];
  /** Their interval has not passed since their last good scan. */
  notDue: string[];
  /** No adapter yet, so not fetched. */
  noAdapter: string[];
}

/** One fetched group's readable responses, as stored in the blob. */
export interface RawScan {
  groupId: string;
  slot: string;
  /** Epoch ms when the scan started. */
  fetchedAt: number;
  responses: { url: string; status: number; contentType: string | null; body: string }[];
}

export function rawKey(slot: string, groupId: string): string {
  return `raw/${slot}/${groupId}.json`;
}

/** The start of a slot from `slotId` (`@bd/core`), e.g. "20261201T0900", in epoch ms. */
export function slotStart(slot: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(slot);
  if (!m) throw new Error(`not a slot id: ${slot}`);
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  return Date.UTC(y, mo - 1, d, h, mi);
}

/** Whether a group is due in `slot`, given the slot of its last good scan. */
export function isGroupDue(group: LaunchGroup, slot: string, lastGood: string | null): boolean {
  if (lastGood === null || group.minIntervalMinutes <= 0) return true;
  return slotStart(slot) - slotStart(lastGood) >= group.minIntervalMinutes * 60_000;
}

const MAX_ERROR = 200;
const short = (text: string) =>
  text.length > MAX_ERROR ? `${text.slice(0, MAX_ERROR - 1)}…` : text;

interface GroupScan {
  groupId: string;
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  error: string | null;
  responses: RawScan["responses"];
}

/** Why a response was not readable, in this file's words only. */
function parseFailure(err: unknown): string {
  // ParseError messages are the adapters' own; any other error may quote the body.
  return err instanceof ParseError ? `parse: ${err.message}` : `parse: ${(err as Error)?.name}`;
}

async function scanGroup(
  group: LaunchGroup,
  adapter: Adapter,
  nowMs: number,
  fetchOne: (url: string) => Promise<FetchResult>,
): Promise<GroupScan> {
  const result: GroupScan = {
    groupId: group.id,
    ok: false,
    httpStatus: null,
    itemCount: 0,
    error: null,
    responses: [],
  };
  let urls: readonly string[];
  try {
    urls = adapter.urls(group, nowMs);
  } catch (err) {
    return { ...result, error: `urls: ${(err as Error)?.name}` };
  }
  if (urls.length === 0) return { ...result, error: "no URLs to fetch" };

  const answers = await Promise.all(urls.map(fetchOne));
  const failures: { status: number | null; error: string }[] = [];
  for (const answer of answers) {
    if (!answer.ok) {
      failures.push({ status: answer.status, error: answer.error });
      continue;
    }
    try {
      result.itemCount += adapter.parse(answer.body, answer.url).length;
    } catch (err) {
      failures.push({ status: answer.status, error: parseFailure(err) });
      continue;
    }
    if (result.httpStatus === null) result.httpStatus = answer.status;
    const { url, status, contentType, body } = answer;
    result.responses.push({ url, status, contentType, body });
  }

  result.ok = result.responses.length > 0;
  const first = failures[0];
  if (first) {
    if (!result.ok) result.httpStatus = first.status;
    result.error = short(
      failures.length === 1 && urls.length === 1
        ? first.error
        : `${failures.length} of ${urls.length} URLs failed; first: ${first.error}`,
    );
  }
  return result;
}

/** The slot of each group's last good scan before `slot`. */
async function lastGoodScans(db: Db, slot: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ groupId: scanResults.groupId, slot: max(scanResults.slot) })
    .from(scanResults)
    .where(and(eq(scanResults.ok, true), lt(scanResults.slot, slot)))
    .groupBy(scanResults.groupId);
  return new Map(rows.flatMap((r) => (r.slot === null ? [] : [[r.groupId, r.slot] as const])));
}

export function scanStep(deps: ScanDeps): Step {
  return {
    name: "scan",
    async run(ctx): Promise<ScanOutput> {
      const nowMs = ctx.now();
      const { settings } = await readSettings(ctx.db, nowMs);
      const fetchOne = (url: string) =>
        fetchSource(url, {
          timeoutMs: settings.fetchTimeoutSeconds * 1000,
          retries: settings.fetchRetries,
          retryDelayMs: settings.fetchRetryDelaySeconds * 1000,
          fetch: deps.fetch,
          ...(deps.sleep ? { sleep: deps.sleep } : {}),
        });

      const last = await lastGoodScans(ctx.db, ctx.slot);
      const output: ScanOutput = { fetched: [], missing: [], notDue: [], noAdapter: [] };
      const due: { group: LaunchGroup; adapter: Adapter }[] = [];
      for (const group of deps.groups) {
        const adapter = deps.adapters[group.id];
        if (!adapter) output.noAdapter.push(group.id);
        else if (!isGroupDue(group, ctx.slot, last.get(group.id) ?? null)) {
          output.notDue.push(group.id);
        } else due.push({ group, adapter });
      }

      const scans = await Promise.all(
        due.map(({ group, adapter }) => scanGroup(group, adapter, nowMs, fetchOne)),
      );

      for (const scan of scans) {
        if (!scan.ok) {
          // An earlier attempt in this slot may have stored it: a missing
          // group has no raw responses.
          await deps.blobs.delete(rawKey(ctx.slot, scan.groupId));
          output.missing.push(scan.groupId);
          continue;
        }
        const raw: RawScan = {
          groupId: scan.groupId,
          slot: ctx.slot,
          fetchedAt: nowMs,
          responses: scan.responses,
        };
        await deps.blobs.put(
          rawKey(ctx.slot, scan.groupId),
          JSON.stringify(raw),
          "application/json",
        );
        output.fetched.push(scan.groupId);
      }

      const rows = scans.map((s) => ({
        slot: ctx.slot,
        groupId: s.groupId,
        ok: s.ok,
        httpStatus: s.httpStatus,
        itemCount: s.itemCount,
        error: s.error,
      }));
      // One insert per row: D1 binds at most 100 values in one statement, and
      // a row has six, so one insert for every group would fail at 17.
      const clear = ctx.db.delete(scanResults).where(eq(scanResults.slot, ctx.slot));
      await ctx.db.batch([clear, ...rows.map((row) => ctx.db.insert(scanResults).values(row))]);
      return output;
    },
  };
}
