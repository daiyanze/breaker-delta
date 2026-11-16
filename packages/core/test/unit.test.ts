// Independent unit assertions (not derived from golden.json):
// the formulas and quirks stated in NODE-MIGRATION.md, checked
// against hand-computed values.

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import {
  alertsData,
  buildTopics,
  catRulesFromConfig,
  classify,
  DEFAULT_CAT_RULE_SET,
  heatOf,
  itemTime,
  makeTopicKeyer,
  scanTokens,
  slugify,
  topicWeights,
} from "../src/index.js";
import type { Edition } from "../src/index.js";

describe("heat formula (v2, uncapped)", () => {
  it("must + 2 sources + 1 link + first seen = 60+40+8+25", () => {
    strictEqual(
      heatOf({ level: "must", sources: ["a", "b"], links: ["u"], is_new: true }),
      133,
    );
  });
  it("unknown level falls back to base 10", () => {
    strictEqual(heatOf({ level: "breaking", sources: [], links: [] }), 10);
  });
  it("no cap at high counts", () => {
    strictEqual(
      heatOf({ level: "must", sources: Array(20).fill("s"), links: Array(10).fill("l"), is_new: true }),
      60 + 400 + 80 + 25,
    );
  });
});

describe("classify rule order", () => {
  it("title beats body even for a lower-priority rule", () => {
    strictEqual(classify("新模型发布", "正文有漏洞"), "AI 模型");
  });
  it("安全 precedes 开源 within the same text", () => {
    strictEqual(classify("开源仓库爆出漏洞", ""), "安全");
  });
});

describe("configurable category rules (presets)", () => {
  const finance = catRulesFromConfig({
    categories: {
      fallback: "市场动态",
      rules: [
        { name: "货币政策", keywords: ["利率", "央行"], en: "Monetary Policy" },
        { name: "公司财报", keywords: ["财报", "营收"] },
      ],
    },
  });
  it("object form parses rules, fallback and i18n names", () => {
    deepStrictEqual(finance?.rules, [
      ["货币政策", ["利率", "央行"]],
      ["公司财报", ["财报", "营收"]],
    ]);
    strictEqual(finance?.fallback, "市场动态");
    deepStrictEqual(finance?.i18n, { "货币政策": { en: "Monetary Policy" } });
  });
  it("classify honours a custom rule set and its fallback", () => {
    strictEqual(classify("央行宣布调整利率", "", finance!), "货币政策");
    strictEqual(classify("某公司发布新模型", "", finance!), "市场动态");
    strictEqual(classify("某公司发布新模型", ""), "AI 模型");
  });
  it("bare-list and name->keywords map forms parse too", () => {
    deepStrictEqual(
      catRulesFromConfig({ categories: [{ name: "宏观", keywords: ["GDP"] }] })?.rules,
      [["宏观", ["GDP"]]],
    );
    deepStrictEqual(
      catRulesFromConfig({ categories: { "宏观": ["GDP"], fallback: "其他" } }),
      { rules: [["宏观", ["GDP"]]], fallback: "其他" },
    );
  });
  it("absent or empty categories yield null (default stays)", () => {
    strictEqual(catRulesFromConfig({}), null);
    strictEqual(catRulesFromConfig({ categories: { rules: [] } }), null);
    strictEqual(catRulesFromConfig({ categories: [{ name: "x", keywords: [] }] }), null);
    strictEqual(catRulesFromConfig(null), null);
  });
  it("buildTopics threads the rule set into appearance categories", () => {
    const ed = {
      date: "2026-11-16", slot: "morning", published_at: "2026-11-16T06:00:00+09:00",
      items: [{ title: "央行调整利率", body: "", level: "must", sources: ["a", "b"], links: [], is_new: true, _heat: 100, _rank: 1 }],
    } as unknown as Edition;
    strictEqual(buildTopics([ed], [], finance!)[0].apps[0].category, "货币政策");
    strictEqual(buildTopics([ed], [])[0].apps[0].category, DEFAULT_CAT_RULE_SET.fallback);
  });
});

describe("slugify truncation", () => {
  it("caps at 48 chars and re-trims a trailing dash", () => {
    strictEqual(slugify(`${"x".repeat(47)} y${"z".repeat(10)}`, "t"), "x".repeat(47));
  });
  it("counts CJK as single characters", () => {
    strictEqual(slugify("模".repeat(60), "t"), "模".repeat(48));
  });
});

describe("two tokenisers differ on purpose", () => {
  it("scanTokens drops short words and stopwords; publishTokens keeps digits/CJK singles", () => {
    deepStrictEqual([...scanTokens("GPT-5 发布")].sort(), ["gpt-5"]);
  });
  it("topicWeights: empty topics dict falls back to legacy list", () => {
    deepStrictEqual(
      topicWeights({ topics: {}, grading: { relevance_topics: ["A"] } }),
      { A: 1 },
    );
  });
});

describe("itemTime", () => {
  it("naive ISO is read as UTC, like Python", () => {
    const d = itemTime({ source: "s", name: "n", url: "u", metrics: { published: "2026-11-13T10:00:00" } });
    strictEqual(d?.toISOString(), "2026-11-13T10:00:00.000Z");
  });
  it("garbage returns null", () => {
    strictEqual(
      itemTime({ source: "s", name: "n", url: "u", metrics: { published: "not a date" } }),
      null,
    );
  });
});

describe("makeTopicKeyer: indexed ledger matching keeps topicKey semantics", () => {
  const ledger = [
    { name: "alpha beta gamma delta epsilon zeta eta theta" },
    { name: "alpha beta gamma delta epsilon zeta eta iota" },
    { name: "unrelated words here" },
  ];
  it("merges at >= 6 shared tokens, first ledger entry wins ties", () => {
    const keyer = makeTopicKeyer(ledger);
    // Shares 7 tokens with both entries 0 and 1 -> tie -> entry 0.
    deepStrictEqual(keyer({ title: "alpha beta gamma delta epsilon zeta eta" }), [
      "led:alpha beta gamma delta epsilon zeta eta theta",
      "alpha beta gamma delta epsilon zeta eta theta",
    ]);
  });
  it("stays its own topic below the threshold", () => {
    const keyer = makeTopicKeyer(ledger);
    deepStrictEqual(keyer({ title: "alpha beta gamma" }), ["own:alpha beta gamma", "alpha beta gamma"]);
  });
  it("hard-coded arcs run before ledger matching", () => {
    const keyer = makeTopicKeyer(ledger);
    deepStrictEqual(keyer({ title: "Anthropic 发布新模型" }), ["arc:anthropic", "Anthropic IPO"]);
    deepStrictEqual(keyer({ title: "黄仁勋谈 AI 芯片" }), ["arc:nvidia", "黄仁勋 / Nvidia 风波"]);
  });
});

describe("alerts: new topics report resonance only, never surge", () => {
  it("a brand-new high-heat topic yields exactly one resonance alert", () => {
    const ed: Edition = {
      date: "2026-11-13",
      slot: "morning",
      published_at: "2026-11-13T06:00:00+09:00",
      items: [
        {
          level: "must", title: "全新话题", body: "", action: "",
          sources: ["a", "b", "c"], links: ["https://x/1"], is_new: true,
          _heat: 60 + 60 + 8 + 25, _rank: 1,
        },
      ],
    };
    const topics = buildTopics([ed], []);
    const alerts = alertsData([ed], topics);
    strictEqual(alerts.alerts.length, 1);
    strictEqual(alerts.alerts[0].reason, "resonance");
    strictEqual(alerts.alerts[0].heat_before, 0);
  });
});
