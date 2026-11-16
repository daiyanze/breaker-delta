// Ticker extraction (Plugin-P2 entities slot reference
// implementation). Pure text matching over the topic's latest
// appearance: $CASHTAGs plus a small bilingual company-name table.
// Deliberately a dictionary, not NLP — predictable, reviewable,
// and easy for a preset to replace with its own plugin.

const TABLE: [string, string[]][] = [
  ["NVDA", ["英伟达", "NVIDIA", "Nvidia"]],
  ["AAPL", ["苹果公司", "Apple"]],
  ["MSFT", ["微软", "Microsoft"]],
  ["GOOGL", ["谷歌", "Google", "Alphabet"]],
  ["AMZN", ["亚马逊", "Amazon"]],
  ["META", ["Meta"]],
  ["TSLA", ["特斯拉", "Tesla"]],
  ["AVGO", ["博通", "Broadcom"]],
  ["AMD", ["AMD", "超威半导体"]],
  ["INTC", ["英特尔", "Intel"]],
  ["NFLX", ["奈飞", "Netflix"]],
  ["TSM", ["台积电", "TSMC"]],
  ["ARM", ["Arm Holdings"]],
  ["ORCL", ["甲骨文", "Oracle"]],
  ["PLTR", ["Palantir"]],
  ["COIN", ["Coinbase"]],
  ["MU", ["美光", "Micron"]],
  ["ASML", ["阿斯麦", "ASML"]],
  ["BABA", ["阿里巴巴", "Alibaba"]],
  ["PDD", ["拼多多", "PDD Holdings"]],
  ["0700.HK", ["腾讯", "Tencent"]],
  ["3690.HK", ["美团", "Meituan"]],
  ["1810.HK", ["小米集团", "Xiaomi"]],
  ["1211.HK", ["比亚迪", "BYD"]],
  ["0981.HK", ["中芯国际", "SMIC"]],
];

interface TopicLike {
  apps: { title?: string; body?: string; action?: string }[];
}

export function extractEntities(
  _ctx: unknown,
  topic: TopicLike,
): { type: string; name: string }[] {
  const last = topic.apps[topic.apps.length - 1];
  if (!last) return [];
  const text = `${last.title ?? ""}\n${last.body ?? ""}\n${last.action ?? ""}`;
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (symbol: string): void => {
    if (seen.has(symbol)) return;
    seen.add(symbol);
    found.push(symbol);
  };
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) push(m[1]);
  for (const [symbol, names] of TABLE) {
    for (const name of names) {
      const hit = /[一-鿿]/.test(name)
        ? text.includes(name)
        : new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
      if (hit) {
        push(symbol);
        break;
      }
    }
  }
  return found.map((name) => ({ type: "ticker", name }));
}
