// Shared types/helpers for fetcher modules.

import type { RadarConfig, SourceResult } from "@breaker-delta/core";

export interface FetchOpts {
  /** Base directory for state files with relative paths (sitemaps).
   *  Defaults to the process working directory, matching Python's
   *  CWD-relative state paths. */
  baseDir?: string;
  /** Environment for token-gated fetchers (x, producthunt);
   *  defaults to process.env. */
  env?: Record<string, string | undefined>;
}

export type FetcherFn = (
  config: RadarConfig,
  now?: Date,
  opts?: FetchOpts,
) => Promise<SourceResult>;

export interface FetcherModule {
  SOURCE: string;
  LAYER: number;
  fetch: FetcherFn;
}

/** config["sources"][source] as a plain record ({} when absent or
 *  not a mapping, mirroring the Python .get(..., {}) chains). */
export function sourceCfg(config: RadarConfig, source: string): Record<string, unknown> {
  const sources = (config as Record<string, unknown>)?.sources;
  if (sources !== null && typeof sources === "object" && !Array.isArray(sources)) {
    const cfg = (sources as Record<string, unknown>)[source];
    if (cfg !== null && typeof cfg === "object" && !Array.isArray(cfg)) {
      return cfg as Record<string, unknown>;
    }
  }
  return {};
}

export function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
