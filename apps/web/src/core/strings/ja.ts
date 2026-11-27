/** The site's interface strings in Japanese. Keys and `{names}`: `en.ts`. */
import type { Table } from "./en.ts";

export const ja: Table = {
  "front.name": "一面",
  "front.edition": "{label} 版。海況：{sea}。波は{waves}、きょう新たに{formed}。",
  "front.flat.name": "海は凪いでいます。",
  "front.flat.text": "まだ何もスキャンしていません。次のスキャン：{next}。",
  "ebb.name": "引き潮のお知らせ",
  "ebb.note":
    "新しいエコーがなければ、波は時間とともに低くなります。その退潮を謹んでお知らせします。",
  "ebb.wentFlat": "凪になった {count} 件を読む",
  "ebb.sunset": "凪の海に沈む夕日",
  "ebb.obit": "{day}に波となる。最高 {peak}。遺したエコーは {echoes} 件。",
  "ebb.obit.one": "{day}に波となる。最高 {peak}。遺したエコーは {echoes} 件。",
  "ebb.now": "現在 {height}、24 時間で {drop}% 低下",
  "ebb.now.only": "現在 {height}",
  "ebb.ripple": "平らになっていく波線、現在 {height}",
  "ebb.none": "いま引いている波はありません。",
  "classifieds.name": "案内広告",
  "fixture.note": "サンプルデータです。",
  "sea.flat": "凪",
  "sea.calm": "穏やか",
  "sea.moderate": "やや波あり",
  "sea.choppy": "波あり",
  "language.menu": "言語：{language}",
  "theme.toDark": "ダークモードに切り替える",
  "theme.toLight": "ライトモードに切り替える",
  "scaffold.name": "足場",
  "scaffold.text": "2.0 の足場です。サイトはマイルストーン M3 で公開されます。",
  "catalog.name": "カタログ",
  "catalog.summary":
    "コンポーネント {components} 個、テーマ {themes} 種、言語 {languages} 種。このページ：{theme}、{language}。",
  "catalog.states": "{layer}、状態 {count} 個",
  "catalog.theme.light": "ライト",
  "catalog.theme.dark": "ダーク",
};
