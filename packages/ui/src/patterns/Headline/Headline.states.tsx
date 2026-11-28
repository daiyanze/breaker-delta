/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { echoStackLayers } from "../EchoStack/EchoStack.tsx";
import {
  Headline,
  type HeadlineLead,
  type HeadlineProps,
  type HeadlineStory,
} from "./Headline.tsx";

// Sample data from boards 01 and 02. The page writes every string; here
// they are written out in English, and in Chinese and Japanese for the
// states whose layout follows the language.

type Change = { formedToday: true } | { change: number };
type Lang = "en" | "zh" | "ja";

const WORDS: Record<
  Lang,
  {
    new: string;
    up: (p: number) => string;
    down: (p: number) => string;
    meta: (s: number, e: number) => string;
    tallest: string;
    formed: string;
    stack: (n: number) => string;
    trend: string;
    note: string;
  }
> = {
  en: {
    new: "New today.",
    up: (p) => `Up ${p}% in 24 hours.`,
    down: (p) => `Down ${p}% in 24 hours.`,
    meta: (s, e) => `${s} independent sources, ${e} echoes.`,
    tallest: "Tallest wave right now",
    formed: "Formed today, already the tallest",
    stack: (n) => `Echoes stacking into a wave, ${n} layers high`,
    trend: "Wave height of the tallest story up to 14:00",
    note: "Headline size follows wave height. Red formed today. Lighter ink is fading.",
  },
  zh: {
    new: "今天新成。",
    up: (p) => `24 小时内上涨 ${p}%。`,
    down: (p) => `24 小时内下降 ${p}%。`,
    meta: (s, e) => `${s} 个独立来源，${e} 条回波。`,
    tallest: "此刻最高的浪",
    formed: "今天新成，已是最高",
    stack: (n) => `回波叠成浪，高 ${n} 层`,
    trend: "最高这条到 14:00 为止的浪高",
    note: "标题字号随浪高。红色是今天新成，浅色墨是正在退。",
  },
  ja: {
    new: "きょうできた波。",
    up: (p) => `24 時間で ${p}% 上昇。`,
    down: (p) => `24 時間で ${p}% 下降。`,
    meta: (s, e) => `独立した情報源 ${s}、エコー ${e}。`,
    tallest: "いまいちばん高い波",
    formed: "きょうできて、もういちばん高い",
    stack: (n) => `エコーが重なって波に、${n} 層の高さ`,
    trend: "いちばん高い記事の 14:00 までの波高",
    note: "見出しの大きさは波高に比例。赤はきょうできた波、薄い墨は引いていく波。",
  },
};

function story(
  lang: Lang,
  title: string,
  height: number,
  change: Change,
  sources: number,
  echoes: number,
): HeadlineStory {
  const formedToday = "formedToday" in change;
  const pct = "change" in change ? change.change : 0;
  return {
    href: `#${title.length}-${height}`,
    title: { lang, text: title },
    height,
    formedToday,
    fading: pct < 0,
    delta: formedToday ? WORDS[lang].new : pct < 0 ? WORDS[lang].down(-pct) : WORDS[lang].up(pct),
    meta: WORDS[lang].meta(sources, echoes),
  };
}

function lead(s: HeadlineStory, trend: number[]): HeadlineLead {
  const words = WORDS[s.title.lang as Lang];
  return {
    ...s,
    kicker: s.formedToday ? words.formed : words.tallest,
    stackLabel: words.stack(echoStackLayers(s.height)),
    trend,
    trendLabel: words.trend,
  };
}

const NOTE = WORDS.en.note;
const TREND = [182, 180, 178, 176, 175, 190, 194, 196];

const busy: HeadlineProps = {
  lead: lead(
    story(
      "en",
      "Chipmaker board rules out bringing back its founder CEO",
      196,
      { change: 63 },
      6,
      31,
    ),
    TREND,
  ),
  second: [
    story(
      "en",
      "State attorney general sues an AI lab over 80 rogue-agent incidents",
      181,
      { formedToday: true },
      4,
      14,
    ),
    story("en", "Six US banks go offline on the same afternoon", 171, { formedToday: true }, 5, 12),
  ],
  third: [
    story(
      "en",
      "Security agency warns about an open-source AI hacking tool",
      151,
      { formedToday: true },
      4,
      9,
    ),
    story(
      "en",
      "New frontier model keeps drawing benchmarks and backlash",
      144,
      { change: -18 },
      5,
      22,
    ),
    story(
      "en",
      "Black Friday decoy discounts: 29% of 351 deals saved nothing",
      131,
      { formedToday: true },
      2,
      6,
    ),
  ],
  note: NOTE,
};

const LONG =
  "A regional grid operator, three utilities and the national weather service disagree in public about why a heat-wave forecast missed by eleven degrees";

export default states(Headline, {
  default: busy,
  // The tallest wave formed today: the other kicker.
  formed: {
    ...busy,
    lead: lead(
      story(
        "en",
        "Open-weights model ships at a quarter of flagship pricing",
        126,
        { formedToday: true },
        3,
        7,
      ),
      [126],
    ),
    second: [],
    third: [],
  },
  // The tallest wave going out, and a quiet day: one story under it.
  fading: {
    lead: lead(
      story(
        "en",
        "Chat assistant gets a wallet and starts paying for you",
        124,
        { change: -22 },
        5,
        18,
      ),
      [150, 146, 142, 138, 134, 130, 127, 124],
    ),
    second: [
      story("en", "Airline bans AI agents from booking flights", 99, { change: -21 }, 5, 11),
    ],
    third: [],
    note: NOTE,
  },
  // A wave taller than the scale's 200: every tier at its full size.
  tallest: {
    ...busy,
    lead: lead(
      story("en", "Six US banks go offline on the same afternoon", 420, { change: 140 }, 9, 88),
      [120, 210, 300, 420],
    ),
  },
  long: {
    ...busy,
    lead: lead(story("en", LONG, 196, { change: 63 }, 6, 31), TREND),
    second: [story("en", LONG, 181, { formedToday: true }, 4, 14), ...busy.second.slice(1)],
    third: [story("en", LONG, 151, { formedToday: true }, 4, 9), ...busy.third.slice(1)],
  },
  zh: {
    lead: lead(story("zh", "芯片商董事会排除让创始人 CEO 回归", 196, { change: 63 }, 6, 31), TREND),
    second: [
      story(
        "zh",
        "州检察长起诉一家 AI 实验室，涉 80 起失控代理事件",
        181,
        { formedToday: true },
        4,
        14,
      ),
      story("zh", "美国六家银行同一天下午宕机", 171, { formedToday: true }, 5, 12),
    ],
    third: [
      story("zh", "安全机构就一款开源 AI 黑客工具发出警告", 151, { formedToday: true }, 4, 9),
      story("zh", "新前沿模型持续引发跑分与争议", 144, { change: -18 }, 5, 22),
      story("zh", "黑五假折扣：351 笔交易中 29% 没省钱", 131, { formedToday: true }, 2, 6),
    ],
    note: WORDS.zh.note,
  },
  ja: {
    lead: lead(
      story("ja", "半導体メーカーの取締役会、創業者 CEO の復帰を否定", 196, { change: 63 }, 6, 31),
      TREND,
    ),
    second: [
      story(
        "ja",
        "州司法長官が AI ラボを提訴、暴走エージェント 80 件",
        181,
        { formedToday: true },
        4,
        14,
      ),
      story("ja", "米銀 6 行が同じ午後に停止", 171, { formedToday: true }, 5, 12),
    ],
    third: [
      story(
        "ja",
        "セキュリティ機関、オープンソースの AI ハッキングツールに警告",
        151,
        { formedToday: true },
        4,
        9,
      ),
      story("ja", "新フロンティアモデル、ベンチマークと反発が続く", 144, { change: -18 }, 5, 22),
      story(
        "ja",
        "ブラックフライデーの見せかけ割引：351 件の 29% は得にならず",
        131,
        { formedToday: true },
        2,
        6,
      ),
    ],
    note: WORDS.ja.note,
  },
});
