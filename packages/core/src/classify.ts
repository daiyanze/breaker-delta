// Category classification, ported from radar/publish.py `classify`.
// Quirk preserved: the title is scanned against ALL rules before the
// body is looked at; within a text, the first matching rule wins.
// Matching is a case-sensitive substring check, exactly like Python's
// `in` — "github" does not match the "GitHub" keyword.
//
// The rule set is configurable: a preset (presets/<name>/config.yaml)
// or an instance config can carry a `categories` section, parsed by
// catRulesFromConfig(). CAT_RULES below is the ai-tech preset's rule
// set kept as the built-in default, so an instance with no categories
// configured behaves exactly as before.

export type CatRule = [string, string[]];

export interface CatRuleSet {
  /** Ordered [category, keywords] pairs; first match wins. */
  rules: CatRule[];
  /** Category for items no rule matches. */
  fallback: string;
  /** Optional per-category display names: cat -> lang -> name. */
  i18n?: Record<string, Record<string, string>>;
}

export const FALLBACK_CATEGORY = "行业动态";

export const CAT_RULES: CatRule[] = [
  ["安全", ["漏洞", "攻击", "后门", "泄露", "入侵", "恶意软件"]],
  ["政策与监管", ["监管", "出口管制", "国会", "禁令", "法规", "审查", "制裁", "听证", "法案"]],
  ["开源", ["开源", "开放权重", "GitHub", "llama.cpp", "open source", "Open Source"]],
  ["商业与资本", ["IPO", "融资", "收购", "财报", "股价", "辞职", "董事会", "CEO", "上市", "估值", "裁员"]],
  ["Agent 与应用", ["Agent", "agent", "智能体", "钱包", "Wallet", "Copilot", "助手"]],
  ["AI 模型", ["模型", "Gemini", "GPT", "Claude", "DeepSeek", "LLM", "发布", "推出", "版本"]],
];

export const DEFAULT_CAT_RULE_SET: CatRuleSet = {
  rules: CAT_RULES,
  fallback: FALLBACK_CATEGORY,
};

export function classify(
  title: string | null | undefined,
  body: string | null | undefined,
  catRules: CatRuleSet = DEFAULT_CAT_RULE_SET,
): string {
  for (const text of [title ?? "", body ?? ""]) {
    for (const [cat, kws] of catRules.rules) {
      if (kws.some((k) => text.includes(k))) return cat;
    }
  }
  return catRules.fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validRule(name: unknown, keywords: unknown): CatRule | null {
  if (typeof name !== "string" || name.trim() === "") return null;
  if (!Array.isArray(keywords)) return null;
  const kws = keywords.filter((k): k is string => typeof k === "string" && k !== "");
  return kws.length > 0 ? [name, kws] : null;
}

/**
 * Parse a config's `categories` section into a CatRuleSet, or null
 * when the section is absent or carries no valid rule (callers then
 * keep the built-in default). Accepted shapes:
 *
 *   categories:
 *     fallback: 行业动态        # optional; en/ja via fallback_en/_ja
 *     rules:
 *       - name: 安全
 *         keywords: [漏洞, 攻击]
 *         en: Security          # optional display names
 *         ja: セキュリティ
 *
 *   categories:                 # bare list of rules
 *     - {name: 安全, keywords: [漏洞]}
 *
 *   categories:                 # name -> keywords map
 *     安全: [漏洞, 攻击]
 */
export function catRulesFromConfig(config: unknown): CatRuleSet | null {
  if (!isRecord(config)) return null;
  const section = config["categories"];
  if (section === undefined || section === null) return null;

  const rules: CatRule[] = [];
  const i18n: Record<string, Record<string, string>> = {};
  let fallback: string = FALLBACK_CATEGORY;
  const addI18n = (cat: string, en: unknown, ja: unknown) => {
    const names: Record<string, string> = {};
    if (typeof en === "string" && en !== "") names["en"] = en;
    if (typeof ja === "string" && ja !== "") names["ja"] = ja;
    if (Object.keys(names).length > 0) i18n[cat] = names;
  };
  const pushEntry = (entry: unknown) => {
    if (!isRecord(entry)) return;
    const rule = validRule(entry["name"], entry["keywords"]);
    if (!rule) return;
    rules.push(rule);
    addI18n(rule[0], entry["en"], entry["ja"]);
  };

  if (Array.isArray(section)) {
    for (const entry of section) pushEntry(entry);
  } else if (isRecord(section)) {
    if (typeof section["fallback"] === "string" && section["fallback"] !== "") {
      fallback = section["fallback"];
    }
    addI18n(fallback, section["fallback_en"], section["fallback_ja"]);
    if (Array.isArray(section["rules"])) {
      for (const entry of section["rules"]) pushEntry(entry);
    } else {
      for (const [name, value] of Object.entries(section)) {
        if (name === "fallback" || name === "fallback_en" || name === "fallback_ja") continue;
        const rule = validRule(name, value);
        if (rule) rules.push(rule);
      }
    }
  }

  if (rules.length === 0) return null;
  const out: CatRuleSet = { rules, fallback };
  if (Object.keys(i18n).length > 0) out.i18n = i18n;
  return out;
}
