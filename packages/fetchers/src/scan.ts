// Scan orchestration, ported from radar/scan.py's run_scan +
// summary_lines: run all fetchers, apply user controls and the name
// vocabulary, group possible cross-source resonance, persist the
// candidate file for the agent to judge.
//
// The code gathers and counts; grading stays with the agent
// (SKILL.md). This is the minimal orchestration for parity/dual-run
// purposes — the formal CLI arrives in Phase 4.
//
// Differences forced by the platform, kept minimal:
// - fetchers are async, so runScan is async;
// - relative state paths (vocab, sitemaps, the candidates file)
//   resolve against opts.baseDir (default process.cwd()) instead of
//   implicitly against the CWD, mirroring what the Python process
//   would do when launched from that directory.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  applyControls,
  applyVocab,
  resonanceGroups,
} from "@breaker-delta/core";
import type {
  RadarConfig,
  SourceResult,
  VocabStats,
} from "@breaker-delta/core";
import { fsVocabIo } from "@breaker-delta/stores";
import { missing } from "./common.js";
import { FETCHERS } from "./fetchers/index.js";
import { pyIsoformat } from "./py.js";

/** The fetcher module shape (built-ins and plugin fetchers alike). */
export interface FetcherModule {
  SOURCE: string;
  LAYER: number;
  fetch: (
    config: RadarConfig,
    now: Date,
    opts: { baseDir: string; env?: Record<string, string | undefined> },
  ) => Promise<SourceResult>;
}

export interface ScanOptions {
  now?: Date;
  /** Directory the candidates file is written to
   *  (default: <baseDir>/state, like Python's out_dir="state"). */
  stateDir?: string;
  /** Base for relative state paths (vocab / sitemaps) and stateDir. */
  baseDir?: string;
  env?: Record<string, string | undefined>;
  /** Extra fetcher modules (Plugin-P1 code plugins), run after
   *  the built-ins under the same config controls. */
  extraFetchers?: FetcherModule[];
}

export interface ScanReport {
  edition: string;
  scanned_at: string;
  sources: SourceResult[];
  resonance: ReturnType<typeof resonanceGroups>;
  keyword_alerts: unknown[];
  controls: unknown;
  vocab: VocabStats | Record<string, unknown>;
  missing: string[];
  disabled: string[];
  _file?: string;
  [key: string]: unknown;
}

export async function runScan(
  edition: string,
  config: RadarConfig,
  opts: ScanOptions = {},
): Promise<ScanReport> {
  const now = opts.now ?? new Date();
  const baseDir = opts.baseDir ?? process.cwd();
  const results: SourceResult[] = [];
  const sourcesCfg = (config as Record<string, unknown>)?.sources;
  for (const mod of [...FETCHERS, ...(opts.extraFetchers ?? [])]) {
    const rawCfg =
      sourcesCfg !== null && typeof sourcesCfg === "object"
        ? (sourcesCfg as Record<string, unknown>)[mod.SOURCE]
        : undefined;
    const srcCfg =
      rawCfg !== null && typeof rawCfg === "object" && !Array.isArray(rawCfg)
        ? (rawCfg as Record<string, unknown>)
        : {};
    if (srcCfg["enabled"] === false) {
      results.push({
        source: mod.SOURCE,
        layer: mod.LAYER,
        status: "disabled",
        items: [],
        note: "disabled in config (enabled: false)",
      });
      continue;
    }
    let result: SourceResult;
    try {
      result = await mod.fetch(config, now, { baseDir, env: opts.env });
    } catch (err) {
      result = missing(
        mod.SOURCE,
        mod.LAYER,
        `fetcher error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const maxItems = srcCfg["max_items"] as number | undefined;
    if (maxItems && result.items.length > Math.trunc(Number(maxItems))) {
      result.items = result.items.slice(0, Math.trunc(Number(maxItems)));
      const note = `capped at ${maxItems} by config max_items`;
      result.note = result.note ? `${result.note}; ${note}` : note;
    }
    results.push(result);
  }
  const [stats, alerts] = applyControls(results, config, now);
  // applyVocab resolves vocab.state_file itself; make it absolute
  // against baseDir first so the state lands where Python's would
  // when launched from baseDir.
  const vocabCfg = { ...((config.vocab ?? {}) as Record<string, unknown>) };
  const vocabState = (vocabCfg["state_file"] as string | undefined) ?? "state/vocab.json";
  const vocabConfig: RadarConfig = {
    ...config,
    vocab: {
      ...vocabCfg,
      state_file: path.isAbsolute(vocabState)
        ? vocabState
        : path.join(baseDir, vocabState),
    },
  };
  const vocabStats = applyVocab(results, vocabConfig, now, fsVocabIo);
  const report: ScanReport = {
    edition,
    scanned_at: pyIsoformat(now),
    sources: results,
    resonance: resonanceGroups(results),
    keyword_alerts: alerts,
    controls: stats,
    vocab: vocabStats,
    missing: results.filter((r) => r.status === "missing").map((r) => r.source),
    disabled: results.filter((r) => r.status === "disabled").map((r) => r.source),
  };
  const outDir = opts.stateDir ?? path.join(baseDir, "state");
  fs.mkdirSync(outDir, { recursive: true });
  const ymd =
    `${now.getUTCFullYear()}` +
    `${String(now.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(now.getUTCDate()).padStart(2, "0")}`;
  const outPath = path.join(outDir, `candidates-${ymd}-${edition}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
  report._file = outPath;
  return report;
}

export function summaryLines(report: ScanReport): string[] {
  const lines: string[] = [
    `scan ${report.edition} @ ${report.scanned_at} -> ${report._file}`,
  ];
  for (const result of report.sources) {
    const source = String(result.source).padEnd(12);
    const status = String(result.status).padEnd(7);
    lines.push(
      `  L${result.layer} ${source} ${status} items=${result.items.length}` +
        (result.note ? ` (${result.note})` : ""),
    );
  }
  lines.push(`  resonance groups: ${report.resonance.length}`);
  const controls = (report.controls ?? {}) as Record<string, number>;
  if (Object.values(controls).some((v) => v)) {
    lines.push(
      `  controls: muted=${controls["muted"] ?? 0} stale=${controls["stale"] ?? 0} ` +
        `boost=${controls["boost_tagged"] ?? 0} alert=${controls["alert_tagged"] ?? 0}`,
    );
  }
  if (report.keyword_alerts.length > 0) {
    lines.push(`  keyword alerts: ${report.keyword_alerts.length}`);
  }
  const vocab = (report.vocab ?? {}) as Record<string, unknown>;
  if (vocab["enabled"] !== false && Object.keys(vocab).length > 0) {
    if (vocab["baseline"]) {
      lines.push(
        `  vocab: baseline built (${vocab["size"] ?? 0} names); ` +
          "novelty flags start with the next scan",
      );
    } else {
      lines.push(
        `  vocab: ${vocab["novel"] ?? 0} novel names (vocab size ${vocab["size"] ?? 0})`,
      );
    }
  }
  return lines;
}
