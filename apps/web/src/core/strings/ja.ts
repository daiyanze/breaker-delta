/** The site's interface strings in Japanese. Keys and `{names}`: `en.ts`. */
import type { Table } from "./en.ts";

export const ja: Table = {
  "front.name": "一面",
  "front.edition": "{label} 版。海況：{sea}。波は{waves}、きょう新たに{formed}。",
  "front.flat.name": "海は凪いでいます。",
  "front.flat.text": "まだ何もスキャンしていません。次のスキャン：{next}。",
  "verdicts.name": "当たったか？",
  "verdicts.note":
    "波ごとに検証の基準を 1 つ、波になったその時に固定し、14 日後に外部の報道と照らし合わせます。人が判定を確定すると、半券に印が押されます。",
  "verdicts.none": "期限の来た検証はまだありません。",
  "stamp.due": "{date} 期限",
  "stamp.under_review": "検証中",
  "stamp.hit": "的中",
  "stamp.partial": "部分的中",
  "stamp.miss": "外れ",
  "stamp.undetermined": "判定不能",
  "stub.day": "{days} 日中 {day} 日目",
  "stub.confirmed": "{date} 確定",
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
