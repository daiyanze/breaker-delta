/** @jsxImportSource preact */
import { states } from "../../runtime/index.ts";
import { Footer, type FooterProps } from "./Footer.tsx";

const EN: FooterProps = {
  subscribe: {
    action: "/subscribe",
    label: "One email a day, with the new waves.",
    placeholder: "you@example.com",
    button: "Subscribe",
  },
  navLabel: "Footer",
  links: [
    { href: "/about#height", label: "How wave height is scored", short: "How it is scored" },
    { href: "/about#own", label: "Run your own radar", short: "Run your own" },
    { href: "/about#open", label: "Atom feed, API and open data", short: "Feed, API, data" },
    { href: "https://github.com/daiyanze/breaker-delta", label: "GitHub" },
  ],
  art: "A lighthouse on a rock sweeps its beam over rolling waves and a small sailboat",
  notes: ["Breaker Delta is open source."],
};

const { subscribe: _form, ...NO_FORM } = EN;

// The form's heading line and the links wrap with their text, so long text
// and each language's own text are states (ADR 0020, section 12). The form
// is hidden when the site sends no email (#81): `no-form`. The form's
// answers (sending, sent, errors) are #145's states.
export default states(Footer, {
  default: EN,
  "no-form": NO_FORM,
  long: {
    ...EN,
    subscribe: {
      action: "/subscribe",
      label:
        "One email a day, with every new wave, the ones still rising and the ones that went flat since yesterday.",
      placeholder: "someone.with.a.long.address@example.com",
      button: "Subscribe to the daily edition",
    },
    links: [
      {
        href: "/about#height",
        label: "How wave height is scored, from echoes, sources, heat and freshness",
        short: "How wave height is scored, step by step",
      },
      ...EN.links.slice(1),
    ],
    notes: [
      "Breaker Delta is open source, and anyone can run their own copy of it.",
      "Every number on this page is computed by code, never by the model.",
    ],
  },
  zh: {
    subscribe: {
      action: "/zh/subscribe",
      label: "每天一封邮件，带来新成的浪。",
      placeholder: "you@example.com",
      button: "订阅",
    },
    navLabel: "页脚",
    links: [
      { href: "/zh/about#height", label: "浪高是怎么算的", short: "浪高怎么算" },
      { href: "/zh/about#own", label: "自己架一台雷达", short: "自己架一台" },
      { href: "/zh/about#open", label: "Atom 订阅源、API 和开放数据", short: "订阅源、API、数据" },
      { href: "https://github.com/daiyanze/breaker-delta", label: "GitHub" },
    ],
    art: "礁石上的灯塔把光束扫过起伏的海浪和一艘小帆船",
    notes: ["Breaker Delta 是开源项目。"],
  },
  ja: {
    subscribe: {
      action: "/ja/subscribe",
      label: "新しい波を、毎日一通のメールで。",
      placeholder: "you@example.com",
      button: "購読する",
    },
    navLabel: "フッター",
    links: [
      { href: "/ja/about#height", label: "波の高さの決め方", short: "高さの決め方" },
      { href: "/ja/about#own", label: "自分のレーダーを動かす", short: "自分で動かす" },
      {
        href: "/ja/about#open",
        label: "Atom フィード、API、オープンデータ",
        short: "フィード・API・データ",
      },
      { href: "https://github.com/daiyanze/breaker-delta", label: "GitHub" },
    ],
    art: "岩の上の灯台が、うねる波と小さな帆船の上に光を走らせています",
    notes: ["Breaker Delta はオープンソースです。"],
  },
});
