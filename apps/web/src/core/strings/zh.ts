/** The site's interface strings in Chinese. Keys and `{names}`: `en.ts`. */
import type { Table } from "./en.ts";

export const zh: Table = {
  "front.name": "头版",
  "front.edition": "{label} 版。海况：{sea}。{waves} 个浪，今天新成 {formed} 个。",
  "front.flat.name": "海面风平浪静。",
  "front.flat.text": "还没有扫描过任何内容。下次扫描：{next}。",
  "verdicts.name": "我们说对了吗？",
  "verdicts.note":
    "每个浪都有一条复核标准，成浪那一刻锁定，14 天后对照外部报道检验。有人确认结论后，票根就盖上章。",
  "verdicts.none": "还没有到期的复核。",
  "stamp.due": "{date}到期",
  "stamp.under_review": "复核中",
  "stamp.hit": "命中",
  "stamp.partial": "部分命中",
  "stamp.miss": "未命中",
  "stamp.undetermined": "无法判定",
  "stub.day": "第 {day} 天，共 {days} 天",
  "stub.confirmed": "{date}确认",
  "classifieds.name": "分类广告",
  "fixture.note": "示例数据。",
  "sea.flat": "无浪",
  "sea.calm": "平静",
  "sea.moderate": "微浪",
  "sea.choppy": "有浪",
  "language.menu": "语言：{language}",
  "theme.toDark": "切换到深色模式",
  "theme.toLight": "切换到浅色模式",
  "scaffold.name": "脚手架",
  "scaffold.text": "2.0 脚手架。网站将在 M3 里程碑上线。",
  "catalog.name": "组件目录",
  "catalog.summary":
    "{components} 个组件，{themes} 种主题，{languages} 种语言。本页：{theme}，{language}。",
  "catalog.states": "{layer}，{count} 种状态",
  "catalog.theme.light": "浅色",
  "catalog.theme.dark": "深色",
};
