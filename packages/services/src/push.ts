// The push API contract — one transport-neutral implementation
// (Rewrite Phase 2b). The CLI's `serve` and the web app's API
// routes are thin adapters over these functions: same validation,
// same messages, same status semantics, so an agent pushing an
// edition or a record cannot tell the two servers apart.
//
// Contract summary (both /api/* and /api/v1/* paths):
//   auth    no token configured -> 403 "push API disabled (set
//           BD_PUSH_TOKEN)"; wrong/missing bearer -> 401 "bad or
//           missing bearer token"
//   record  body is a JSON array of {name, sources, grade};
//           result {created, updated, total}
//   edition body is one edition object with date (YYYY-MM-DD),
//           slot (morning|evening) and items[]; an existing
//           (date, slot) is a 409 unless ?replace=1

import { upsertTopic, type Edition, type TopicStore } from "@breaker-delta/core";

// ------------------------------------------------------------ record

export interface RecordEntry {
  name: string;
  sources: string[];
  grade: string;
}

/** Validate a record push body. Throws Error with the contract
 *  messages (adapters map that to their 400 / CLI error type). */
export function validateRecordEntries(data: unknown): RecordEntry[] {
  if (!Array.isArray(data)) {
    throw new Error("record: input must be a JSON array of {name, sources, grade}");
  }
  return data.map((raw, i) => {
    const e = raw as Record<string, unknown>;
    if (typeof e?.name !== "string" || e.name === "") {
      throw new Error(`record: entry ${i}: name must be a non-empty string`);
    }
    if (!Array.isArray(e.sources) || e.sources.some((s) => typeof s !== "string")) {
      throw new Error(`record: entry ${i}: sources must be an array of strings`);
    }
    if (typeof e.grade !== "string" || e.grade === "") {
      throw new Error(`record: entry ${i}: grade must be a non-empty string`);
    }
    return { name: e.name, sources: e.sources as string[], grade: e.grade };
  });
}

export interface ApplyRecordResult {
  created: number;
  updated: number;
  total: number;
  lines: string[];
}

/** Apply validated entries to a topic store in place (the pure
 *  heart of both servers' record handlers and the CLI's `record`
 *  command). `date` is the record date override the CLI command
 *  accepts; the push handlers leave it undefined. */
export function applyRecordToStore(
  store: TopicStore,
  entries: RecordEntry[],
  date?: string,
): ApplyRecordResult {
  let created = 0;
  let updated = 0;
  const lines: string[] = [];
  for (const entry of entries) {
    const existed = store.topics.some((t) => t.name === entry.name);
    upsertTopic(store, entry.name, entry.sources, entry.grade, date);
    if (existed) {
      updated += 1;
      lines.push(`updated: ${entry.name}`);
    } else {
      created += 1;
      lines.push(`created: ${entry.name}`);
    }
  }
  return { created, updated, total: store.topics.length, lines };
}

// ------------------------------------------------------------ edition

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const EDITION_PUSH_SHAPE_ERROR =
  "edition must be an object with date (YYYY-MM-DD), slot (morning|evening) and items[]";

/** Validate a pushed edition's envelope (date / slot / items).
 *  Item contents are the grader's contract, checked downstream. */
export function validatePushEdition(parsed: unknown): Edition {
  const ed = parsed as { date?: unknown; slot?: unknown; items?: unknown } | null;
  if (
    typeof ed?.date !== "string" ||
    !DATE_RE.test(ed.date) ||
    (ed.slot !== "morning" && ed.slot !== "evening") ||
    !Array.isArray(ed.items)
  ) {
    throw new Error(EDITION_PUSH_SHAPE_ERROR);
  }
  return parsed as Edition;
}

export function editionFileName(date: string, slot: string): string {
  return `${date}-${slot}.json`;
}

export function editionConflictMessage(date: string, slot: string): string {
  return `${editionFileName(date, slot)} already exists (append ?replace=1 to overwrite)`;
}

// ------------------------------------------------------------ auth

export type PushAuthResult =
  | { ok: true }
  | { ok: false; status: 403 | 401; error: string };

/** The bearer-token gate both servers share. An empty configured
 *  token disables the push API entirely (403); a wrong or missing
 *  header is a 401. */
export function checkBearerToken(
  authorizationHeader: string | string[] | null | undefined,
  configuredToken: string,
): PushAuthResult {
  if (configuredToken === "") {
    return { ok: false, status: 403, error: "push API disabled (set BD_PUSH_TOKEN)" };
  }
  if (authorizationHeader !== `Bearer ${configuredToken}`) {
    return { ok: false, status: 401, error: "bad or missing bearer token" };
  }
  return { ok: true };
}
