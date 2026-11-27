/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { Notice } from "./Notice.tsx";

// The ripple's amplitude follows the height, so the lowest (the 2 floor)
// and a tall wave are states. The text sets the box's height: a long state,
// and a state per language with its own text (ADR 0020, section 12). Sample
// data from board 01.
export default states(Notice, {
  default: {
    title: { text: "New frontier model keeps drawing benchmarks and backlash", lang: "en" },
    href: "/topic/frontier-model-backlash",
    text: "A wave since Nov 13. Peaked at 188. Survived by 22 echoes.",
    now: "Now 144, down 18% in 24 hours",
    ripple: { height: 144, label: "A wave line flattening, now at 144" },
  },
  low: {
    title: { text: "Super agent flash model", lang: "en" },
    href: "/topic/super-agent-flash-model",
    text: "A wave since Nov 12. Peaked at 118. Survived by 8 echoes.",
    now: "Now 12, down 61% in 24 hours",
    ripple: { height: 12, label: "A wave line flattening, now at 12" },
  },
  tall: {
    title: { text: "Assistant wallet", lang: "en" },
    href: "/topic/assistant-wallet",
    text: "A wave since Nov 14. Peaked at 212. Survived by 31 echoes.",
    now: "Now 196, down 8% in 24 hours",
    ripple: { height: 196, label: "A wave line flattening, now at 196" },
  },
  long: {
    title: {
      text: "Airline bans booking agents from its site after a weekend of bookings it could not honour, and the agents' makers answer",
      lang: "en",
    },
    href: "/topic/airline-bans-booking-agents",
    text: "A wave since Nov 12. Peaked at 140. Survived by 11 echoes.",
    now: "Now 99, down 21% in 24 hours",
    ripple: { height: 99, label: "A wave line flattening, now at 99" },
  },
  zh: {
    title: { text: "新前沿模型的跑分与争议仍在发酵", lang: "zh" },
    href: "/zh/topic/frontier-model-backlash",
    text: "11月13日成浪。最高 188。身后留下 22 条回波。",
    now: "现在 144，24 小时内下降 18%",
    ripple: { height: 144, label: "一条渐趋平缓的波纹，现在 144" },
  },
  ja: {
    title: { text: "新しい最先端モデル、ベンチマークと反発が続く", lang: "ja" },
    href: "/ja/topic/frontier-model-backlash",
    text: "11月13日に波となる。最高 188。遺したエコーは 22 件。",
    now: "現在 144、24 時間で 18% 低下",
    ripple: { height: 144, label: "平らになっていく波線、現在 144" },
  },
});
