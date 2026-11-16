// UI string lookup over the publisher's STRINGS table (the same table
// the static build renders from), with {key} interpolation.

import { STRINGS } from "@breaker-delta/publisher";

import type { Lang } from "./data";

export function s(lang: Lang, key: string): string {
  const v = STRINGS[lang]?.[key] ?? STRINGS.zh?.[key];
  return typeof v === "string" ? v : "";
}

export function sArr(lang: Lang, key: string): string[] {
  const v = STRINGS[lang]?.[key] ?? STRINGS.zh?.[key];
  return Array.isArray(v) ? v : [];
}

export function fmt(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ""));
}
