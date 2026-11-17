// The one edition-loading implementation (Rewrite Phase 1c).
//
// Before this module, edition files were parsed in three places —
// the CLI's plugin passes, the publisher, and the web app — with
// subtly different filename handling. The canonical semantics,
// reconciled from all three:
//
//   - The filename carries the slot: `YYYY-MM-DD-<slot>.json`. A
//     name that does not parse is an error (two of the three
//     loaders already threw; the third silently mis-sorted).
//   - Editions order by (date, slot order, filename): pilot <
//     morning < evening within a day — never raw string order,
//     where "evening" would sort before "morning".
//   - `_heat`/`_rank` are attached at load: heat via core's heatOf,
//     rank by heat descending with stable order for ties.
//   - Slot adoption is the one declared per-consumer difference:
//     with adoptSlot (the default) a known filename slot is written
//     into the edition; the publisher passes adoptSlot: false
//     because its historical output names edition pages from the
//     JSON's own slot field (usually absent → "None"), and changing
//     that would change published URLs — a product decision, not a
//     refactor side effect.
//
// This module is pure (no fs) so the web app can import it via the
// "@breaker-delta/stores/editions" subpath without pulling node:fs
// into its bundle; the directory loaders live in editions-file.ts.

import { heatOf, type Edition } from "@breaker-delta/core";

export const EDITION_SLOT_ORDER: Record<string, number> = {
  pilot: 0,
  morning: 1,
  evening: 2,
};

const NAME_RE = /(\d{4}-\d{2}-\d{2})-(\w+)/;

/** Date + slot + sort order encoded in an edition filename. */
export function editionFileKey(name: string): { date: string; slot: string; order: number } {
  const m = NAME_RE.exec(name);
  if (!m) throw new Error(`edition filename does not parse: ${name}`);
  return { date: m[1], slot: m[2], order: EDITION_SLOT_ORDER[m[2]] ?? 9 };
}

/** (date, slot order) comparison for already-loaded editions. */
export function compareEditionOrder(
  a: { date: string; slot?: string | null },
  b: { date: string; slot?: string | null },
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (EDITION_SLOT_ORDER[a.slot ?? ""] ?? 9) - (EDITION_SLOT_ORDER[b.slot ?? ""] ?? 9);
}

/** Attach _heat/_rank in place, exactly as every loader has done. */
export function attachEditionHeat(ed: Edition): void {
  const items = ed.items ?? [];
  for (const it of items) it._heat = heatOf(it);
  const ranked = [...items].sort((a, b) => (b._heat ?? 0) - (a._heat ?? 0));
  ranked.forEach((it, i) => {
    it._rank = i + 1;
  });
}

export interface EditionFileEntry {
  file: string;
  data: Edition;
}

export interface ParseEditionOptions {
  /** Write a known filename slot into the edition (default true). */
  adoptSlot?: boolean;
}

/** Parse edition files ({name, text}) into ordered entries. */
export function parseEditionFiles(
  files: { name: string; text: string }[],
  opts: ParseEditionOptions = {},
): EditionFileEntry[] {
  const adoptSlot = opts.adoptSlot ?? true;
  const keyed = files.map(({ name, text }) => ({ name, text, ...editionFileKey(name) }));
  keyed.sort(
    (a, b) =>
      compareEditionOrder(a, b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  return keyed.map(({ name, text, slot }) => {
    const data = JSON.parse(text) as Edition;
    if (adoptSlot && slot in EDITION_SLOT_ORDER) data.slot = slot;
    attachEditionHeat(data);
    return { file: name, data };
  });
}

/** Parse edition files into just the editions, in canonical order. */
export function editionsFromFiles(
  files: { name: string; text: string }[],
  opts: ParseEditionOptions = {},
): Edition[] {
  return parseEditionFiles(files, opts).map((e) => e.data);
}
