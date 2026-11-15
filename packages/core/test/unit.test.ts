// Independent unit assertions (not derived from golden.json):
// the formulas and quirks stated in NODE-MIGRATION.md, checked
// against hand-computed values.

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import {
  alertsData,
  buildTopics,
  classify,
  heatOf,
  itemTime,
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
