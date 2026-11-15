// Data loading, ported from radar/publish.py: `load` (editions +
// ledger), `_yaml_source_blocks` / `load_config_blocks` (the sources
// pages show the settings file's *verbatim text*, not a parse), and
// `source_key` / `source_block` (display name -> fetcher group).

import * as fs from "node:fs";
import * as path from "node:path";

import { heatOf, type Edition, type StoreTopic } from "@breaker-delta/core";

import type { Ctx } from "./ctx.js";
import { OFFICIAL_HINTS, SLOT, SRC_ALIASES, TECH_HINTS } from "./literals.js";
import { pyJsonDumps, universalNewlines } from "./py.js";

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

/**
 * publish.py `load`: editions from editionsDir/*.json, sorted by
 * (date, slot order pilot<morning<evening, unknown slot 9) — the sort
 * key regex runs over the full path string, as in Python — with each
 * item's _heat and in-edition _rank attached; the ledger is
 * ledgerPath's "topics" (missing file -> []).
 */
export function loadEditions(ctx: Ctx): { editions: Edition[]; ledger: StoreTopic[] } {
  let names: string[] = [];
  try {
    names = fs.readdirSync(ctx.editionsDir).filter((n) => n.endsWith(".json"));
  } catch {
    names = []; // glob over a missing directory yields nothing
  }
  const paths = names.map((n) => path.join(ctx.editionsDir, n));
  const keyed = paths.map((p) => {
    const m = /(\d{4}-\d{2}-\d{2})-(\w+)/.exec(p);
    if (!m) throw new Error(`edition filename does not parse: ${p}`);
    const order = hasOwn(SLOT, m[2]) ? SLOT[m[2]][1] : 9;
    return { p, date: m[1], order };
  });
  keyed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
  const editions: Edition[] = [];
  for (const { p } of keyed) {
    const ed = JSON.parse(fs.readFileSync(p, "utf-8")) as Edition;
    for (const it of ed.items) it._heat = heatOf(it);
    const ranked = [...ed.items].sort((a, b) => b._heat - a._heat);
    ranked.forEach((it, i) => {
      it._rank = i + 1;
    });
    editions.push(ed);
  }
  let ledger: StoreTopic[] = [];
  if (fs.existsSync(ctx.ledgerPath)) {
    const data = JSON.parse(fs.readFileSync(ctx.ledgerPath, "utf-8")) as {
      topics?: StoreTopic[];
    };
    if (data.topics === undefined) throw new Error(`ledger has no "topics": ${ctx.ledgerPath}`);
    ledger = data.topics;
  }
  return { editions, ledger };
}

/**
 * Split the sources: section of a YAML config into per-group blocks,
 * dedented, exactly as written in the settings file.
 */
export function yamlSourceBlocks(text: string): Map<string, string> {
  const blocks = new Map<string, string>();
  let cur: string | null = null;
  let buf: string[] = [];
  const flush = (): void => {
    if (cur !== null) blocks.set(cur, buf.join("\n").replace(/\s+$/, ""));
  };
  let inSources = false;
  for (const ln of text.split("\n")) {
    if (/^sources:\s*$/.test(ln)) {
      inSources = true;
      continue;
    }
    if (!inSources) continue;
    if (ln !== "" && !ln.startsWith(" ") && !ln.startsWith("#") && !ln.startsWith("\t")) {
      break; // next top-level key ends the sources section
    }
    const m = /^  ([A-Za-z0-9_]+):\s*$/.exec(ln);
    if (m) {
      flush();
      cur = m[1];
      buf = [ln.slice(2)];
      continue;
    }
    if (cur !== null) buf.push(ln.startsWith("  ") ? ln.slice(2) : ln);
  }
  flush();
  return blocks;
}

/**
 * Per-source-group config text, verbatim from the settings file:
 * config.yaml/.yml wins, then config.example.yaml/.yml; JSON configs
 * fall back to a per-group JSON dump (indent=2, like Python's).
 */
export function loadConfigBlocks(ctx: Ctx): Map<string, string> {
  for (const name of ["config.yaml", "config.yml", "config.example.yaml", "config.example.yml"]) {
    const p = path.join(ctx.configDir, name);
    if (fs.existsSync(p)) {
      try {
        return yamlSourceBlocks(universalNewlines(fs.readFileSync(p, "utf-8")));
      } catch {
        return new Map();
      }
    }
  }
  for (const name of ["config.json", "config.example.json"]) {
    const p = path.join(ctx.configDir, name);
    if (fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as {
          sources?: Record<string, unknown>;
        };
        const srcs = parsed.sources ?? {};
        const out = new Map<string, string>();
        for (const [k, v] of Object.entries(srcs)) {
          out.set(k, pyJsonDumps({ [k]: v }, 2));
        }
        return out;
      } catch {
        return new Map();
      }
    }
  }
  return new Map();
}

/** Map an edition's display source name to its fetcher-group key. */
export function sourceKey(name: string): string | null {
  const low = name.toLowerCase();
  let key: string | null = hasOwn(SRC_ALIASES, low) ? SRC_ALIASES[low] : null;
  if (!key && low.startsWith("reddit")) key = "reddit";
  if (!key && low.startsWith("mastodon")) key = "mastodon";
  if (!key && OFFICIAL_HINTS.some((h) => low.includes(h) || name.includes(h))) {
    key = "official_blogs";
  }
  if (!key && TECH_HINTS.some((h) => low.includes(h))) key = "tech_media";
  if (!key && low.includes("sitemap")) key = "sitemaps";
  return key;
}

/** The source's fetcher-group config block (verbatim settings text). */
export function sourceBlock(
  name: string,
  blocks: Map<string, string>,
): string | null {
  const key = sourceKey(name);
  return key ? (blocks.get(key) ?? null) : null;
}
