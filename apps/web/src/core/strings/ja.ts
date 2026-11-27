/** The site's interface strings in Japanese. Keys and `{names}`: `en.ts`. */
import type { Table } from "./en.ts";

export const ja: Table = {
  "front.name": "一面",
  "front.edition": "{label} 版。海況：{sea}。波は{waves}、きょう新たに{formed}。",
  "front.flat.name": "海は凪いでいます。",
  "front.flat.text": "まだ何もスキャンしていません。次のスキャン：{next}。",
  "classifieds.name": "案内広告",
  "tide.name": "潮汐表",
  "tide.note":
    "きょう波になった話題を、波になった時刻に描いています。近い時刻にいくつも波になると、海面が高くなります。",
  "tide.summary": "きょう {count} 件の話題が波になりました。{first} から {last} まで。",
  "tide.now": "いま",
  "tide.later": "これから",
  "tide.high": "満潮 {time}",
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
