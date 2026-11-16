// Build context: the explicit replacement for publish.py's module
// globals (CUR["lang"], OUT, BASE_URL, DATA_REPO, FAV_FILES, OG_IMG,
// the TS_* environment settings). One Ctx per buildSite() call;
// render functions take it as their first argument.

import * as path from "node:path";

import { DEFAULT_CAT_RULE_SET, type CatRuleSet } from "@breaker-delta/core";

import { CAT_I18N, HTML_LANG, LEVEL_I18N, STRINGS } from "./literals.js";

export interface BuildOptions {
  /** Engine/instance root: assets/, config files and defaults live here. */
  rootDir: string;
  editionsDir?: string;
  ledgerPath?: string;
  /** Ledger markdown for the track-record page; null = rootDir/track-record.md. */
  trackRecordPath?: string | null;
  configDir?: string;
  faviconCacheDir?: string;
  outDir?: string;
  baseUrl?: string;
  /** The standalone docs site's URL (default https://docs.breakerdelta.com/).
   *  The main site's nav links out to it; buildDocsSite uses it as its base. */
  docsUrl?: string;
  /** The main radar site's URL, used by the docs site for back-links
   *  (default https://breakerdelta.com/). */
  mainUrl?: string;
  dataRepo?: string;
  langs?: string[];
  /**
   * Render into this map instead of writing files (keys are POSIX
   * paths relative to the site root, values the file bytes). Used by
   * the dynamic server (renderSiteMap); outDir is then only a label
   * and nothing is written to it.
   */
  sink?: Map<string, Uint8Array>;
  /** Category taxonomy for this build (from the instance config /
   *  preset's `categories` section); default is the ai-tech rule set. */
  catRules?: CatRuleSet;
  creator?: boolean;
  pageSize?: number;
  archiveDays?: number;
  sourcesPerPage?: number;
  shareKeys?: string[];
}

export const DEFAULT_BASE_URL = "https://daiyanze.github.io/breaker-delta/";
export const DEFAULT_DOCS_URL = "https://docs.breakerdelta.com/";
export const DEFAULT_MAIN_URL = "https://breakerdelta.com/";
export const DEFAULT_DATA_REPO = "daiyanze/breaker-delta";
export const DEFAULT_LANGS = ["zh", "en", "ja"];
export const DEFAULT_SHARE_KEYS = [
  "x", "facebook", "linkedin", "telegram", "reddit", "email", "copy",
];

export interface Ctx {
  rootDir: string;
  editionsDir: string;
  ledgerPath: string;
  trackRecordPath: string | null;
  configDir: string;
  faviconCacheDir: string;
  outDir: string;
  baseUrl: string;
  docsUrl: string;
  mainUrl: string;
  dataRepo: string;
  langs: string[];
  catRules: CatRuleSet;
  creator: boolean;
  per: number;
  archiveDays: number;
  sourcesPer: number;
  shareKeys: string[];
  /** CUR["lang"]: the language currently being rendered. */
  lang: string;
  /** OUT for the current language (outDir, or outDir/<lang>). */
  langDir: string;
  /** FAV_FILES: domain -> cached favicon filename, in fetch order. */
  favFiles: Map<string, string>;
  /** When set, all output goes to this map instead of the filesystem. */
  sink: Map<string, Uint8Array> | null;
  /** OG_IMG: true when assets/banner.png exists. */
  ogImg: boolean;
}

function normalizeBaseUrl(u: string): string {
  return u.replace(/\/+$/, "") + "/";
}

export function makeCtx(options: BuildOptions): Ctx {
  const rootDir = options.rootDir;
  return {
    rootDir,
    editionsDir: options.editionsDir ?? path.join(rootDir, "editions"),
    ledgerPath: options.ledgerPath ?? path.join(rootDir, "state", "seen-topics.json"),
    trackRecordPath: options.trackRecordPath ?? null,
    configDir: options.configDir ?? rootDir,
    faviconCacheDir:
      options.faviconCacheDir ?? path.join(rootDir, "favicon-cache"),
    outDir: options.outDir ?? path.join(rootDir, "site"),
    baseUrl:
      options.baseUrl !== undefined ? normalizeBaseUrl(options.baseUrl) : DEFAULT_BASE_URL,
    docsUrl: normalizeBaseUrl(options.docsUrl ?? DEFAULT_DOCS_URL),
    mainUrl: normalizeBaseUrl(options.mainUrl ?? DEFAULT_MAIN_URL),
    dataRepo: options.dataRepo ?? DEFAULT_DATA_REPO,
    langs: options.langs ?? [...DEFAULT_LANGS],
    catRules: options.catRules ?? DEFAULT_CAT_RULE_SET,
    creator: options.creator ?? true,
    per: options.pageSize ?? 100,
    archiveDays: options.archiveDays ?? 7,
    sourcesPer: options.sourcesPerPage ?? 20,
    shareKeys: options.shareKeys ?? [...DEFAULT_SHARE_KEYS],
    lang: "zh",
    langDir: options.outDir ?? path.join(rootDir, "site"),
    favFiles: new Map(),
    ogImg: false,
    sink: options.sink ?? null,
  };
}

function envInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`invalid integer: ${raw}`);
  return n;
}

function envList(raw: string | undefined, fallback: string): string[] {
  return (raw ?? fallback)
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");
}

/**
 * Build options from the same environment variables publish.py reads
 * (TS_OUT / TS_BASE_URL / TS_DOCS_URL / TS_MAIN_URL / TS_DATA_REPO / TS_LANGS / TS_CREATOR /
 * TS_PAGE_SIZE / TS_ARCHIVE_DAYS / TS_SOURCES_PAGE / TS_SHARE), so a
 * data repo's CI contract carries over unchanged.
 */
export function optionsFromEnv(
  env: Record<string, string | undefined>,
  rootDir: string,
): BuildOptions {
  const opts: BuildOptions = { rootDir };
  if (env.TS_OUT !== undefined) opts.outDir = env.TS_OUT;
  if (env.TS_BASE_URL !== undefined) opts.baseUrl = env.TS_BASE_URL;
  if (env.TS_DOCS_URL !== undefined) opts.docsUrl = env.TS_DOCS_URL;
  if (env.TS_MAIN_URL !== undefined) opts.mainUrl = env.TS_MAIN_URL;
  if (env.TS_DATA_REPO !== undefined) opts.dataRepo = env.TS_DATA_REPO;
  opts.langs = envList(env.TS_LANGS, "zh,en,ja");
  const creatorRaw = (env.TS_CREATOR ?? "1").toLowerCase();
  opts.creator = !["0", "false", "no"].includes(creatorRaw);
  opts.pageSize = envInt(env.TS_PAGE_SIZE, 100);
  opts.archiveDays = envInt(env.TS_ARCHIVE_DAYS, 7);
  opts.sourcesPerPage = envInt(env.TS_SOURCES_PAGE, 20);
  opts.shareKeys = envList(
    env.TS_SHARE,
    "x,facebook,linkedin,telegram,reddit,email,copy",
  );
  return opts;
}

// ------------------------------------------------------------ strings

/** publish.py's s(): the current language's string for a key. */
export function s(ctx: Ctx, key: string): string {
  return STRINGS[ctx.lang][key] as string;
}

/** s() for the list-valued keys (tabs, th, tr_th). */
export function sArr(ctx: Ctx, key: string): string[] {
  return STRINGS[ctx.lang][key] as string[];
}

export function catName(ctx: Ctx, cat: string): string {
  if (ctx.lang === "zh") return cat;
  return ctx.catRules.i18n?.[cat]?.[ctx.lang] ?? CAT_I18N[cat]?.[ctx.lang] ?? cat;
}

export function levelLabel(ctx: Ctx, level: string | null | undefined): string {
  const table = (level != null ? LEVEL_I18N[level] : undefined) ?? LEVEL_I18N["echo"];
  return table[ctx.lang];
}

export function langPrefix(ctx: Ctx): string {
  return ctx.lang === "zh" ? "" : ctx.lang + "/";
}

export function htmlLang(ctx: Ctx): string {
  return HTML_LANG[ctx.lang];
}
