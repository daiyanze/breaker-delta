/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { TicketStubs } from "./TicketStubs.tsx";

const due = (day: number, label: string) => ({
  stamp: { kind: "due" as const, label, loud: true },
  progress: { day, days: 14, label: `Day ${day} of 14` },
});

// Board 01's three due stubs; one stub alone, which takes the whole row;
// and a row in each language, whose text sets the stubs' height.
export default states(TicketStubs, {
  default: {
    stubs: [
      {
        id: "p9",
        ...due(7, "Due Nov 26"),
        criterion: {
          text: "Mainstream outlets confirm a new or interim CEO, or the founder’s return.",
          lang: "en",
        },
        topic: { text: "Chipmaker board ousts its founder CEO", lang: "en", href: "/topic/a" },
      },
      {
        id: "p8",
        ...due(7, "Due Nov 26"),
        criterion: {
          text: "Another US airline or booking platform announces the same rule.",
          lang: "en",
        },
        topic: { text: "Airline bans AI agents from booking", lang: "en", href: "/topic/b" },
      },
      {
        id: "p10",
        ...due(6, "Due Nov 27"),
        criterion: {
          text: "The maker publishes official pricing or a general release date.",
          lang: "en",
        },
        topic: { text: "New frontier model", lang: "en", href: "/topic/c" },
      },
    ],
  },
  one: {
    stubs: [
      {
        id: "p9",
        stamp: { kind: "miss", label: "Miss" },
        criterion: {
          text: "The maker publishes official pricing or a general release date.",
          lang: "en",
        },
        topic: { text: "New frontier model", lang: "en", href: "/topic/c" },
        note: "Confirmed Nov 27",
      },
    ],
  },
  zh: {
    stubs: [
      {
        id: "p9",
        stamp: { kind: "due", label: "11月26日到期", loud: true },
        progress: { day: 7, days: 14, label: "第 7 天，共 14 天" },
        criterion: { text: "主流媒体确认新的或临时首席执行官，或创始人回归。", lang: "zh" },
        topic: { text: "芯片厂董事会罢免创始人 CEO", lang: "zh", href: "/zh/topic/a" },
      },
      {
        id: "p8",
        stamp: { kind: "hit", label: "命中" },
        criterion: { text: "另一家美国航空公司或订票平台宣布同样的规定。", lang: "zh" },
        topic: { text: "航空公司禁止 AI 智能体订票", lang: "zh", href: "/zh/topic/b" },
        note: "11月27日确认",
      },
    ],
  },
  ja: {
    stubs: [
      {
        id: "p9",
        stamp: { kind: "due", label: "11月26日 期限", loud: true },
        progress: { day: 7, days: 14, label: "14 日中 7 日目" },
        criterion: {
          text: "主要メディアが新しい CEO か暫定 CEO、または創業者の復帰を報じる。",
          lang: "ja",
        },
        topic: { text: "半導体大手の取締役会、創業者 CEO を解任", lang: "ja", href: "/ja/topic/a" },
      },
      {
        id: "p8",
        stamp: { kind: "under_review", label: "検証中" },
        criterion: { text: "別の米航空会社か予約サイトが同じ規則を発表する。", lang: "ja" },
        topic: {
          text: "航空会社、AI エージェントによる予約を禁止",
          lang: "ja",
          href: "/ja/topic/b",
        },
        note: "12月2日 期限",
      },
    ],
  },
});
