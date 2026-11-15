// Category classification, ported from radar/publish.py `classify`.
// Quirk preserved: the title is scanned against ALL rules before the
// body is looked at; within a text, the first matching rule wins.
// Matching is a case-sensitive substring check, exactly like Python's
// `in` — "github" does not match the "GitHub" keyword.

export const CAT_RULES: [string, string[]][] = [
  ["安全", ["漏洞", "攻击", "后门", "泄露", "入侵", "恶意软件"]],
  ["政策与监管", ["监管", "出口管制", "国会", "禁令", "法规", "审查", "制裁", "听证", "法案"]],
  ["开源", ["开源", "开放权重", "GitHub", "llama.cpp", "open source", "Open Source"]],
  ["商业与资本", ["IPO", "融资", "收购", "财报", "股价", "辞职", "董事会", "CEO", "上市", "估值", "裁员"]],
  ["Agent 与应用", ["Agent", "agent", "智能体", "钱包", "Wallet", "Copilot", "助手"]],
  ["AI 模型", ["模型", "Gemini", "GPT", "Claude", "DeepSeek", "LLM", "发布", "推出", "版本"]],
];

export function classify(title: string | null | undefined, body: string | null | undefined): string {
  for (const text of [title ?? "", body ?? ""]) {
    for (const [cat, kws] of CAT_RULES) {
      if (kws.some((k) => text.includes(k))) return cat;
    }
  }
  return "行业动态";
}
