/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import type { IndexRowProps } from "../IndexRow/IndexRow.tsx";
import Index, { type IndexProps } from "./Index.island.tsx";

// Sample data from boards 01 and 02: sixteen waves, two of them formed
// today. The page writes every string; here they are written out in
// English, and in Chinese and Japanese for the states whose layout follows
// the language.

type Lang = "en" | "zh" | "ja";

// short title per language, height, change (null: formed today)
const WAVES: [Record<Lang, string>, number, number | null][] = [
  [{ en: "Founder CEO ousted", zh: "创始人 CEO 被罢免", ja: "創業者 CEO が解任" }, 196, 63],
  [
    { en: "AI lab sued over agents", zh: "AI 实验室因代理被起诉", ja: "AI 研究所が提訴される" },
    181,
    null,
  ],
  [{ en: "Six banks offline", zh: "六家银行停摆", ja: "6 銀行が停止" }, 171, null],
  [
    { en: "AI hacking tool warning", zh: "AI 黑客工具警告", ja: "AI ハッキングツールに警告" },
    151,
    12,
  ],
  [{ en: "Frontier model backlash", zh: "前沿模型遭反弹", ja: "最先端モデルに反発" }, 144, -18],
  [{ en: "Decoy discounts", zh: "诱饵折扣", ja: "おとり値引き" }, 131, 4],
  [{ en: "Open-weights model", zh: "开放权重模型", ja: "オープンウェイトのモデル" }, 122, 9],
  [{ en: "Assistant wallet", zh: "助手钱包", ja: "アシスタントの財布" }, 117, -22],
  [{ en: "Agent booking ban", zh: "代理订票禁令", ja: "エージェント予約の禁止" }, 110, -21],
  [{ en: "Super-agent release", zh: "超级代理发布", ja: "スーパーエージェント公開" }, 104, -21],
  [
    { en: "Browser agent permissions", zh: "浏览器代理权限", ja: "ブラウザエージェントの権限" },
    92,
    0,
  ],
  [{ en: "Cloud outage postmortem", zh: "云故障事后报告", ja: "クラウド障害の事後報告" }, 86, 0],
  [
    { en: "Robotaxi permit expands", zh: "无人出租车许可扩大", ja: "ロボタクシー許可が拡大" },
    79,
    0,
  ],
  [{ en: "Retailer extension recall", zh: "零售商扩展被召回", ja: "小売の拡張機能を回収" }, 71, 0],
  [{ en: "Context registry opens", zh: "上下文登记处开放", ja: "コンテキスト登録所が開設" }, 66, 0],
  [{ en: "Quantum error-rate claim", zh: "量子错误率声明", ja: "量子エラー率の主張" }, 62, 0],
];

const WORDS: Record<
  Lang,
  { name: string; order: string; note: string; new: string; all: string; fewer: string }
> = {
  en: {
    name: "The index",
    order: "by height",
    note: "Red numbers formed today. The change is over 24 hours.",
    new: "new",
    all: "Show all 16 waves",
    fewer: "Show the top 8",
  },
  zh: {
    name: "索引",
    order: "按浪高",
    note: "红色数字是今天新成的浪。变化按 24 小时计。",
    new: "新",
    all: "显示全部 16 个浪",
    fewer: "只显示前 8 个",
  },
  ja: {
    name: "索引",
    order: "波高順",
    note: "赤い数字はきょうできた波。変化は 24 時間の値。",
    new: "新",
    all: "16 の波をすべて表示",
    fewer: "上位 8 だけ表示",
  },
};

function change(c: number | null, lang: Lang): string {
  if (c === null) return WORDS[lang].new;
  if (c > 0) return `+${c}%`;
  if (c < 0) return `−${-c}%`;
  return "";
}

function rows(lang: Lang, count = WAVES.length): IndexRowProps[] {
  return WAVES.slice(0, count).map(([title, height, c], k) => ({
    href: `/topic/wave-${k + 1}`,
    rank: k + 1,
    title: { lang, text: title[lang] },
    height,
    formedToday: c === null,
    change: change(c, lang),
  }));
}

function index(lang: Lang, over: Partial<IndexProps> = {}): IndexProps {
  const w = WORDS[lang];
  return {
    id: `index-${lang}`,
    name: w.name,
    order: w.order,
    rows: rows(lang),
    note: w.note,
    showAll: w.all,
    showFewer: w.fewer,
    ...over,
  };
}

const LONG_TITLES = [
  "A regulator in three countries opens a joint inquiry into browser agent permissions",
  "Six banks go offline for most of a working day after a shared vendor's update fails",
];

export default states(Index, {
  default: index("en"),
  open: index("en", { id: "index-open", open: true }),
  quiet: index("en", { id: "index-quiet", rows: rows("en", 2), showAll: "Show all 2 waves" }),
  long: index("en", {
    id: "index-long",
    rows: rows("en").map((r, k) => {
      const text = LONG_TITLES[k % 2] ?? r.title.text;
      const long = { title: { lang: "en", text }, formedToday: false, change: "+1,240%" };
      return k < 4 ? { ...r, ...long } : r;
    }),
  }),
  zh: index("zh"),
  ja: index("ja"),
});
