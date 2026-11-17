// @breaker-delta/i18n — the one UI string catalog (Rewrite
// Phase 3b). Per-language copy lives in zh.ts / en.ts / ja.ts
// (zh is the reference; en/ja string tables are typed against
// zh's key set, so a missing or extra key is a compile error).
// This module reassembles the historical table shapes the
// publisher and the web app consume, and holds the key-keyed
// label tables (domain key -> per-language label) plus language
// metadata.

import * as en from "./en.js";
import * as ja from "./ja.js";
import * as zh from "./zh.js";

export type { StringKey } from "./zh.js";

export type Lang = "zh" | "en" | "ja";
export const LANGS: Lang[] = ["zh", "en", "ja"];

const byLang = { zh, en, ja } as const;

/** The main UI string table: lang -> key -> string | string[].
 *  Typed loosely (any language code) because runtime language
 *  packs extend the built-in set; the built-in tables' key parity
 *  is enforced in the per-language files. */
export const STRINGS: Record<string, Record<string, string | string[]>> = {
  zh: zh.strings,
  en: en.strings,
  ja: ja.strings,
};

/** Long-form per-language copy (about page / landing page). */
export const ABOUT: Record<string, string> = { zh: zh.about, en: en.about, ja: ja.about };
export const LANDING: Record<string, string> = { zh: zh.landing, en: en.landing, ja: ja.landing };

export const HOOK_T: Record<string, Record<string, string>> = {
  zh: zh.hookT,
  en: en.hookT,
  ja: ja.hookT,
};
export const SHORT_TIPS: Record<string, string[]> = {
  zh: zh.shortTips,
  en: en.shortTips,
  ja: ja.shortTips,
};
export const LONG_TIPS: Record<string, string[]> = {
  zh: zh.longTips,
  en: en.longTips,
  ja: ja.longTips,
};

export const LEVEL_I18N: Record<string, Record<string, string>> = {
 "must": {
  "zh": "必看",
  "en": "Must-read",
  "ja": "必読"
 },
 "watch": {
  "zh": "关注",
  "en": "Watch",
  "ja": "注目"
 },
 "echo": {
  "zh": "回波",
  "en": "Echo",
  "ja": "エコー"
 }
};

export const CAT_I18N: Record<string, Record<string, string>> = {
 "安全": {
  "en": "Security",
  "ja": "セキュリティ"
 },
 "政策与监管": {
  "en": "Policy",
  "ja": "政策・規制"
 },
 "开源": {
  "en": "Open Source",
  "ja": "オープンソース"
 },
 "商业与资本": {
  "en": "Business",
  "ja": "ビジネス"
 },
 "Agent 与应用": {
  "en": "Agents & Apps",
  "ja": "エージェント"
 },
 "AI 模型": {
  "en": "AI Models",
  "ja": "AIモデル"
 },
 "行业动态": {
  "en": "Industry",
  "ja": "業界動向"
 }
};

export const SLOT_LABEL_I18N: Record<string, Record<string, string>> = {
 "pilot": {
  "zh": "试跑",
  "en": "Pilot",
  "ja": "パイロット"
 },
 "morning": {
  "zh": "早报",
  "en": "Morning",
  "ja": "朝刊"
 },
 "evening": {
  "zh": "晚报",
  "en": "Evening",
  "ja": "夕刊"
 }
};

export const SRC_NAMES: Record<string, Record<string, string>> = {
 "Anthropic 官方": {
  "en": "Anthropic (official)",
  "ja": "Anthropic 公式"
 },
 "Anthropic 官方 X（ClaudeDevs）": {
  "en": "Anthropic on X (ClaudeDevs)",
  "ja": "Anthropic 公式 X（ClaudeDevs）"
 },
 "Google News 多家": {
  "en": "Google News (multiple outlets)",
  "ja": "Google News（複数メディア）"
 },
 "Google 官方": {
  "en": "Google (official)",
  "ja": "Google 公式"
 },
 "Google 官方博客": {
  "en": "Google Blog",
  "ja": "Google 公式ブログ"
 },
 "Hugging Face 博客": {
  "en": "Hugging Face Blog",
  "ja": "Hugging Face ブログ"
 },
 "Mastodon 趋势": {
  "en": "Mastodon Trending",
  "ja": "Mastodon トレンド"
 },
 "Microsoft 365 状态页": {
  "en": "Microsoft 365 Status",
  "ja": "Microsoft 365 ステータス"
 },
 "OpenAI 官方博客": {
  "en": "OpenAI Blog",
  "ja": "OpenAI 公式ブログ"
 },
 "Perplexity 官方 X": {
  "en": "Perplexity on X",
  "ja": "Perplexity 公式 X"
 },
 "SEC S-1 修订稿": {
  "en": "SEC S-1 amendment",
  "ja": "SEC S-1 修正届出"
 },
 "Wikipedia 热读榜": {
  "en": "Wikipedia Most Read",
  "ja": "Wikipedia 人気記事"
 },
 "多家分析博客": {
  "en": "Analyst blogs (multiple)",
  "ja": "分析ブログ（複数）"
 },
 "官方": {
  "en": "Official",
  "ja": "公式"
 },
 "新华社": {
  "en": "Xinhua",
  "ja": "新華社"
 },
 "社交传播": {
  "en": "Social media",
  "ja": "SNS 拡散"
 }
};

export const ARC_NAMES: Record<string, Record<string, string>> = {
 "Anthropic IPO": {
  "en": "Anthropic IPO",
  "ja": "Anthropic IPO"
 },
 "黄仁勋 / Nvidia 风波": {
  "en": "Jensen Huang / Nvidia turmoil",
  "ja": "ジェンスン・フアン / Nvidia 騒動"
 }
};

export const HTML_LANG: Record<string, string> = {
 "zh": "zh-CN",
 "en": "en",
 "ja": "ja"
};

export const LANG_LABEL: Record<string, string> = {
 "zh": "中文",
 "en": "EN",
 "ja": "日本語"
};


/** Look up one UI string; falls back to zh, then to "". */
export function s(lang: string, key: string): string {
  const table = (STRINGS as Record<string, Record<string, string | string[]>>)[lang] ?? STRINGS.zh;
  const v = table[key] ?? STRINGS.zh[key];
  return typeof v === "string" ? v : "";
}

/** Look up one UI string list; falls back to zh, then to []. */
export function sArr(lang: string, key: string): string[] {
  const table = (STRINGS as Record<string, Record<string, string | string[]>>)[lang] ?? STRINGS.zh;
  const v = table[key] ?? STRINGS.zh[key];
  return Array.isArray(v) ? v : [];
}

/** {name} interpolation, the one placeholder style. */
export function fmt(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ""));
}

export { byLang };
