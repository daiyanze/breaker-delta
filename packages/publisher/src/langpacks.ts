// Language packs (Plugin-P3): UI-string overlays from the data dir.
//
// A pack is <dataDir>/langpacks/<code>/pack.json:
//
//   {
//     "code": "ko",
//     "name": "한국어",
//     "base": "en",
//     "strings": { "site_name": "...", "wave": "...", ... }
//   }
//
// Two shapes:
//   - code is a built-in language (zh/en/ja): an OVERRIDE pack —
//     its strings replace individual built-in UI strings (rewording
//     the shell without touching the engine).
//   - code is new: the pack ADDS a language. Its UI strings start
//     from the `base` language's table (default en) with the pack's
//     strings on top; long-form blobs (About / Landing) and panel /
//     plugin texts fall back to the base language, and edition
//     CONTENT still comes from the editions' own i18n — a pack is
//     the shell only, never the content (see PLUGINS.md §8).
//
// Validation is strict on purpose: keys must exist in the built-in
// table (a typo must fail loudly, not silently no-op), list-valued
// keys (tabs etc.) must keep the base table's length, and `code`
// must match the directory name. Problems are collected and
// reported (doctor fails on them; publish refuses to build).
//
// Scope note: packs apply to the publisher (static build + the
// CLI's dynamic `serve`, i.e. the Docker self-host form). The
// vinext web app keeps its own string table and does not read
// packs yet.

import * as fs from "node:fs";
import * as path from "node:path";

import { HTML_LANG, LANG_LABEL, STRINGS } from "./literals.js";

export const BASE_LANGS = ["zh", "en", "ja"] as const;
const CODE_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export interface LangPack {
  code: string;
  name?: string;
  base: string;
  strings: Record<string, string | string[]>;
  dir: string;
}

export function loadLangPacksFromDir(
  dataDir: string,
): { packs: LangPack[]; problems: string[] } {
  const root = path.join(dataDir, "langpacks");
  const packs: LangPack[] = [];
  const problems: string[] = [];
  if (!fs.existsSync(root)) return { packs, problems };
  for (const entry of fs.readdirSync(root).sort()) {
    const dir = path.join(root, entry);
    const file = path.join(dir, "pack.json");
    if (!fs.existsSync(file)) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
    } catch (err) {
      problems.push(
        `langpack ${entry}: pack.json is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
      );
      continue;
    }
    const code = raw.code;
    if (typeof code !== "string" || !CODE_RE.test(code)) {
      problems.push(`langpack ${entry}: "code" must be a language code like "ko" or "pt-BR"`);
      continue;
    }
    if (code !== entry) {
      problems.push(`langpack ${entry}: code "${code}" does not match its directory name`);
      continue;
    }
    const base = typeof raw.base === "string" ? raw.base : "en";
    if (!(BASE_LANGS as readonly string[]).includes(base)) {
      problems.push(`langpack ${code}: "base" must be one of ${BASE_LANGS.join("/")}`);
      continue;
    }
    const strings = raw.strings;
    if (!strings || typeof strings !== "object" || Array.isArray(strings)) {
      problems.push(`langpack ${code}: "strings" must be an object of key -> string | string[]`);
      continue;
    }
    let bad = false;
    for (const [key, value] of Object.entries(strings as Record<string, unknown>)) {
      const baseVal = STRINGS[base][key] ?? STRINGS.en[key];
      if (baseVal === undefined) {
        problems.push(
          `langpack ${code}: unknown string key "${key}" (keys must match the built-in UI string table)`,
        );
        bad = true;
        continue;
      }
      if (Array.isArray(baseVal)) {
        if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
          problems.push(`langpack ${code}: "${key}" must be a list of strings`);
          bad = true;
        } else if (value.length !== baseVal.length) {
          problems.push(
            `langpack ${code}: "${key}" must have ${baseVal.length} entries, like the base table (got ${value.length})`,
          );
          bad = true;
        }
      } else if (typeof value !== "string") {
        problems.push(`langpack ${code}: "${key}" must be a string`);
        bad = true;
      }
    }
    if (bad) continue;
    packs.push({
      code,
      name: typeof raw.name === "string" ? raw.name : undefined,
      base,
      strings: strings as Record<string, string | string[]>,
      dir,
    });
  }
  return { packs, problems };
}

/** The effective string tables with every pack applied. */
export function mergedStrings(
  packs: LangPack[],
): Record<string, Record<string, string | string[]>> {
  const out: Record<string, Record<string, string | string[]>> = {};
  for (const [lang, table] of Object.entries(STRINGS)) out[lang] = { ...table };
  for (const pack of packs) {
    if ((BASE_LANGS as readonly string[]).includes(pack.code)) {
      out[pack.code] = { ...out[pack.code], ...pack.strings };
    } else {
      out[pack.code] = { ...(out[pack.base] ?? { ...STRINGS.en }), ...pack.strings };
    }
  }
  return out;
}

/** Language codes the packs ADD (overrides of built-ins excluded). */
export function addedLangs(packs: LangPack[]): string[] {
  return packs
    .map((p) => p.code)
    .filter((c) => !(BASE_LANGS as readonly string[]).includes(c));
}

/** html lang attributes: built-ins keep theirs; a pack language
 *  uses its own code (ko, pt-BR are valid html lang values). */
export function mergedHtmlLangs(packs: LangPack[]): Record<string, string> {
  const out = { ...HTML_LANG };
  for (const pack of packs) if (!(pack.code in out)) out[pack.code] = pack.code;
  return out;
}

/** Switcher labels: a pack's `name` wins for its language. */
export function mergedLangLabels(packs: LangPack[]): Record<string, string> {
  const out = { ...LANG_LABEL };
  for (const pack of packs) {
    if (pack.name) out[pack.code] = pack.name;
    else if (!(pack.code in out)) out[pack.code] = pack.code;
  }
  return out;
}

/** For long-form blobs (About / Landing) that only exist in the
 *  built-in languages: which language's blob a render in `lang`
 *  should use. */
export function blobLang(packs: LangPack[], lang: string): string {
  if ((BASE_LANGS as readonly string[]).includes(lang)) return lang;
  return packs.find((p) => p.code === lang)?.base ?? "en";
}
