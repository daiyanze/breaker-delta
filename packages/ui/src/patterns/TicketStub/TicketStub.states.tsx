/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { TicketStub } from "./TicketStub.tsx";

const en = (text: string) => ({ text, lang: "en" });

// The small stub of the front page, due and stamped; the large one of the
// topic page; and the test's length and each language's text, which set
// the stub's height (ADR 0020, section 12). Sample text from boards 01, 03
// and 07.
export default states(TicketStub, {
  default: {
    stamp: { kind: "due", label: "Due Nov 26", loud: true },
    criterion: en("Mainstream outlets confirm a new or interim CEO, or the founder’s return."),
    topic: { ...en("Chipmaker board ousts its founder CEO"), href: "/topic/chipmaker" },
    progress: { day: 7, days: 14, label: "Day 7 of 14" },
  },
  stamped: {
    stamp: { kind: "hit", label: "Hit" },
    criterion: en("At least two independent evaluations of the flash model appear."),
    topic: { ...en("Lab releases a super-agent"), href: "/topic/super-agent" },
    note: "Confirmed Nov 26",
  },
  large: {
    size: "large",
    stamp: { kind: "due", label: "Due Nov 26", loud: true },
    criterion: en(
      "By Nov 26, mainstream outlets confirm that the board has named a new or interim chief executive, or that the founder is back.",
    ),
    progress: { day: 7, days: 14, label: "Day 7 of 14." },
    note: "Code locked this test the hour the wave formed. Rewriting the summary does not change it.",
    hash: "Test hash 3f9a…c21e, registered Nov 12 at 18:00",
  },
  long: {
    stamp: { kind: "undetermined", label: "Undecided" },
    criterion: en(
      "Within fourteen days of the wave forming, at least two national regulators outside the United States and the European Union publish guidance, a consultation or an enforcement notice that names agentic booking tools explicitly, and a major booking platform changes its terms in response.",
    ),
    topic: {
      ...en(
        "Airline bans AI agents from booking flights, and booking platforms weigh the same rule",
      ),
      href: "/topic/airline",
    },
    note: "Confirmed Nov 28. The reports we found did not mention merchants either way.",
  },
  zh: {
    size: "large",
    stamp: { kind: "due", label: "11月26日到期", loud: true },
    criterion: {
      text: "11 月 26 日前，主流媒体确认董事会已任命新的或临时首席执行官，或创始人回归。",
      lang: "zh",
    },
    progress: { day: 7, days: 14, label: "第 7 天，共 14 天。" },
    note: "成浪那一刻代码就锁定了这条标准。改写摘要不会改变它。",
    hash: "标准哈希 3f9a…c21e，11 月 12 日 18:00 登记",
  },
  ja: {
    stamp: { kind: "partial", label: "部分的中" },
    criterion: { text: "別の米航空会社か予約サイトが同じ規則を発表する。", lang: "ja" },
    topic: {
      text: "航空会社、AI エージェントによる予約を禁止",
      lang: "ja",
      href: "/ja/topic/airline",
    },
    note: "11月27日に確定",
  },
});
