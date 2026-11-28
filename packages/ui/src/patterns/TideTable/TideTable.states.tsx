/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { TideTable, type TideTableProps, type TideWave } from "./TideTable.tsx";

// Sample data from board 01 (the 14:00 edition of Nov 19). The list's
// titles set its rows' height and the labels' language sets their type, so
// long text and each language are states of their own (ADR 0020, section 12).

type Titles = readonly [string, string, string, string, string];

const AT = [8, 9, 10, 11, 14] as const;
const HEIGHTS = [151, 181, 171, 131, 126] as const;
const SLUGS = [
  "ai-hacking-tool-warning",
  "ai-lab-sued-over-agents",
  "six-banks-offline",
  "decoy-discounts",
  "open-weights-quarter-price",
] as const;

const EN: Titles = [
  "Security agency warns about an open-source AI hacking tool",
  "State attorney general sues an AI lab over 80 rogue-agent incidents",
  "Six US banks go offline on the same afternoon",
  "Black Friday decoy discounts: 29% of 351 deals saved nothing",
  "Open-weights model released with pricing at 25% of flagship",
];
const ZH: Titles = [
  "安全机构就一款开源 AI 黑客工具发出警告",
  "州检察长就 80 起失控智能体事件起诉一家 AI 实验室",
  "美国六家银行同一个下午相继宕机",
  "黑五假折扣：351 个优惠中 29% 并不省钱",
  "Open-weights model released with pricing at 25% of flagship",
];
const JA: Titles = [
  "セキュリティ機関、オープンソースの AI ハッキングツールに警告",
  "州司法長官、暴走エージェント 80 件で AI 研究所を提訴",
  "米銀 6 行、同じ午後に相次いで停止",
  "ブラックフライデーの見せかけ割引、351 件中 29% は安くならず",
  "Open-weights model released with pricing at 25% of flagship",
];

function waves(titles: Titles, lang: string, prefix = ""): TideWave[] {
  return titles.map((title, i) => {
    const hour = AT[i] ?? 0;
    return {
      href: `${prefix}/topic/${SLUGS[i]}`,
      hour,
      at: `${String(hour).padStart(2, "0")}:00`,
      title,
      // The fifth has no summary: its title is the source's own, in English.
      lang: i === 4 ? "en" : lang,
      height: HEIGHTS[i] ?? 0,
    };
  });
}

const en: Omit<TideTableProps, "waves" | "now"> = {
  summary: "5 stories became waves today, between 08:00 and 14:00.",
  nowLabel: "now",
  laterLabel: "still to come",
  highWaterLabel: (time) => `high water, ${time}`,
};

export default states(TideTable, {
  default: { ...en, waves: waves(EN, "en"), now: 14 },
  // The fewest the front page shows: two waves (board 19 leaves the band
  // out with one).
  two: {
    ...en,
    summary: "2 stories became waves today, between 08:00 and 09:00.",
    waves: waves(EN, "en").slice(0, 2),
    now: 9,
  },
  // Late in the day there is no room for "still to come".
  late: {
    ...en,
    summary: "5 stories became waves today, between 08:00 and 22:00.",
    waves: waves(EN, "en").map((w, i) => (i === 4 ? { ...w, hour: 22, at: "22:00" } : w)),
    now: 23,
  },
  long: {
    ...en,
    waves: waves(
      [
        "Security agency warns about an open-source AI hacking tool that anyone can download, and asks every operator to patch",
        EN[1],
        "Six US banks go offline on the same afternoon, and their customers cannot pay, withdraw or see a balance for hours",
        EN[3],
        EN[4],
      ],
      "en",
    ),
    now: 14,
  },
  zh: {
    summary: "今天有 5 个故事成了浪，时间在 08:00 到 14:00 之间。",
    nowLabel: "现在",
    laterLabel: "尚未到来",
    highWaterLabel: (time) => `满潮 ${time}`,
    waves: waves(ZH, "zh", "/zh"),
    now: 14,
  },
  ja: {
    summary: "きょう 5 件の話題が波になりました。08:00 から 14:00 まで。",
    nowLabel: "いま",
    laterLabel: "これから",
    highWaterLabel: (time) => `満潮 ${time}`,
    waves: waves(JA, "ja", "/ja"),
    now: 14,
  },
});
