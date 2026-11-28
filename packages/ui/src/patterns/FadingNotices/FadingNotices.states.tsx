/** @jsxImportSource preact */
import type { NoticeProps } from "../../primitives/Notice/Notice.tsx";
import { states } from "../../runtime/index.ts";
import { FadingNotices } from "./FadingNotices.tsx";

// Sample data from board 01 and the `busy` fixture set. How many notices
// there are sets the layout (one, a full row, a row and a half), so do the
// link and the empty section; the rail's text and the notices' text set it
// too, so long text and each language are states (ADR 0020, section 12).

const en = (
  slug: string,
  title: string,
  since: string,
  peak: number,
  echoes: number,
  height: number,
  down: number,
): NoticeProps => ({
  title: { text: title, lang: "en" },
  href: `/topic/${slug}`,
  text: `A wave since ${since}. Peaked at ${peak}. Survived by ${echoes} echoes.`,
  now: `Now ${height}, down ${down}% in 24 hours`,
  ripple: { height, label: `A wave line flattening, now at ${height}` },
});

const NOTICES: NoticeProps[] = [
  en(
    "frontier-model-backlash",
    "New frontier model keeps drawing benchmarks and backlash",
    "Nov 13",
    188,
    22,
    144,
    18,
  ),
  en("assistant-wallet", "Assistant wallet", "Nov 14", 172, 18, 124, 22),
  en("airline-bans-booking-agents", "Airline bans booking agents", "Nov 12", 140, 11, 99, 21),
  en("super-agent-flash-model", "Super agent flash model", "Nov 12", 118, 8, 80, 21),
];

const RAIL = {
  name: "Fading notices",
  note: "With nothing new, a wave loses height by the hour. We announce their decline with due respect.",
  sunset: "The sun setting over a flat sea",
  none: "No wave is going out.",
};

export default states(FadingNotices, {
  default: {
    ...RAIL,
    wentFlat: { href: "/changes?type=went_flat", text: "Read the 12 that went flat" },
    notices: NOTICES,
  },
  one: { ...RAIL, notices: NOTICES.slice(3) },
  none: { ...RAIL, notices: [] },
  long: {
    ...RAIL,
    name: "Fading notices for every wave that is going out today",
    note: "With nothing new, a wave loses height by the hour, and a wave that loses enough goes flat. We announce their decline with due respect, one notice for each.",
    wentFlat: {
      href: "/changes?type=went_flat",
      text: "Read the 112 that went flat in the last 24 hours",
    },
    notices: [
      en(
        "airline-bans-booking-agents",
        "Airline bans booking agents from its site after a weekend of bookings it could not honour, and the agents' makers answer",
        "Nov 12",
        140,
        11,
        99,
        21,
      ),
      ...NOTICES.slice(0, 2),
    ],
  },
  zh: {
    name: "退潮启事",
    note: "没有新的回波，浪就一小时一小时地落下。我们郑重宣布它们的退潮。",
    sunset: "落日沉入平静的海面",
    none: "眼下没有正在退潮的浪。",
    wentFlat: { href: "/zh/changes?type=went_flat", text: "查看已经平息的 12 个浪" },
    notices: [
      {
        title: { text: "新前沿模型的跑分与争议仍在发酵", lang: "zh" },
        href: "/zh/topic/frontier-model-backlash",
        text: "11月13日成浪。最高 188。身后留下 22 条回波。",
        now: "现在 144，24 小时内下降 18%",
        ripple: { height: 144, label: "一条渐趋平缓的波纹，现在 144" },
      },
      {
        title: { text: "助手钱包", lang: "zh" },
        href: "/zh/topic/assistant-wallet",
        text: "11月14日成浪。最高 172。身后留下 18 条回波。",
        now: "现在 124，24 小时内下降 22%",
        ripple: { height: 124, label: "一条渐趋平缓的波纹，现在 124" },
      },
    ],
  },
  ja: {
    name: "引き潮のお知らせ",
    note: "新しいエコーがなければ、波は時間とともに低くなります。その退潮を謹んでお知らせします。",
    sunset: "凪の海に沈む夕日",
    none: "いま引いている波はありません。",
    wentFlat: { href: "/ja/changes?type=went_flat", text: "凪になった 12 件を読む" },
    notices: [
      {
        title: { text: "新しい最先端モデル、ベンチマークと反発が続く", lang: "ja" },
        href: "/ja/topic/frontier-model-backlash",
        text: "11月13日に波となる。最高 188。遺したエコーは 22 件。",
        now: "現在 144、24 時間で 18% 低下",
        ripple: { height: 144, label: "平らになっていく波線、現在 144" },
      },
      {
        title: { text: "アシスタント・ウォレット", lang: "ja" },
        href: "/ja/topic/assistant-wallet",
        text: "11月14日に波となる。最高 172。遺したエコーは 18 件。",
        now: "現在 124、24 時間で 22% 低下",
        ripple: { height: 124, label: "平らになっていく波線、現在 124" },
      },
    ],
  },
});
