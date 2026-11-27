/** The site's interface strings in Chinese. Keys and `{names}`: `en.ts`. */
import type { Table } from "./en.ts";

export const zh: Table = {
  "front.name": "头版",
  "front.edition": "{label} 版。海况：{sea}。{waves} 个浪，今天新成 {formed} 个。",
  "front.flat.name": "海面风平浪静。",
  "front.flat.text": "还没有扫描过任何内容。下次扫描：{next}。",
  "classifieds.name": "分类广告",
  "tide.name": "潮汐表",
  "tide.note": "今天成浪的故事，画在它成形的钟点上。几条浪成形的时间挨得近，海面就涨得高。",
  "tide.summary": "今天有 {count} 个故事成了浪，时间在 {first} 到 {last} 之间。",
  "tide.now": "现在",
  "tide.later": "尚未到来",
  "tide.high": "满潮 {time}",
  "fixture.note": "示例数据。",
  "sea.flat": "无浪",
  "sea.calm": "平静",
  "sea.moderate": "微浪",
  "sea.choppy": "有浪",
  "language.menu": "语言：{language}",
  "theme.toDark": "切换到深色模式",
  "theme.toLight": "切换到浅色模式",
  "echoStack.label": "回波叠成浪，高 {layers} 层",
  "scaffold.name": "脚手架",
  "scaffold.text": "2.0 脚手架。网站将在 M3 里程碑上线。",
  "catalog.name": "组件目录",
  "catalog.summary":
    "{components} 个组件，{themes} 种主题，{languages} 种语言。本页：{theme}，{language}。",
  "catalog.states": "{layer}，{count} 种状态",
  "catalog.theme.light": "浅色",
  "catalog.theme.dark": "深色",
};
