// Wave height （浪高） v2, ported from radar/publish.py `heat_of`:
// heat = base(must 60 / watch 30 / echo 10, unknown level 10; legacy "seed" aliases echo)
//      + 20 x sources + 8 x links + 25 if first seen. No cap.

export const BASE: Record<string, number> = { must: 60, watch: 30, echo: 10, seed: 10 };

export interface HeatInput {
  level?: string | null;
  sources?: unknown[] | null;
  links?: unknown[] | null;
  is_new?: unknown;
}

export function heatOf(it: HeatInput): number {
  const base = BASE[it.level ?? ""] ?? 10;
  return (
    base +
    20 * (it.sources?.length ?? 0) +
    8 * (it.links?.length ?? 0) +
    (it.is_new ? 25 : 0)
  );
}
