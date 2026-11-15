// Pure-logic tests for the extension. The fixture is synthetic but
// shaped exactly like the publisher's data/topics.json and
// data/alerts.json (same fields, CJK slug included) — real snapshots
// are instance data and never enter this repo.

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AlertEntry, TopicDataEntry } from "@breaker-delta/core";

import {
  alertCount,
  badgeText,
  createEcho,
  findAlert,
  findTopic,
  formatIssueText,
  matchTopic,
  parseAlerts,
  parseTopics,
  topicPageUrl,
} from "../src/logic.js";

const TOPICS: TopicDataEntry[] = [
  {
    slug: "agent-framework-x-发布",
    title: "Agent Framework X 发布",
    heat: 153,
    first_seen: "2026-11-15",
    level: "must",
    url_patterns: ["github.com/example-org/agent-framework"],
    title_keywords: ["Agent Framework", "Agent-Framework", "发布"],
  },
  {
    slug: "local-model-y",
    title: "本地模型 Y 走红",
    heat: 88,
    first_seen: "2026-11-14",
    level: "watch",
    url_patterns: [],
    title_keywords: ["本地模型 Y", "模型 Y"],
  },
];

const ALERTS: AlertEntry[] = [
  {
    topic_slug: "agent-framework-x-发布",
    title: "Agent Framework X 发布",
    reason: "resonance",
    heat_before: 0,
    heat_after: 153,
    edition: "2026-11-15T06:00:00+09:00",
    triggered_at: "2026-11-15T06:00:00+09:00",
    dedupe_key: "agent-framework-x-发布:resonance:2026-11-15-morning",
  },
  {
    topic_slug: "local-model-y",
    title: "本地模型 Y 走红",
    reason: "surge",
    heat_before: 40,
    heat_after: 88,
    edition: "2026-11-15T06:00:00+09:00",
    triggered_at: "2026-11-15T06:00:00+09:00",
    dedupe_key: "local-model-y:surge:2026-11-15-morning",
  },
];

describe("parseTopics / parseAlerts", () => {
  it("round-trips well-formed payloads", () => {
    assert.deepStrictEqual(parseTopics({ generated_at: "x", topics: TOPICS }), TOPICS);
    assert.deepStrictEqual(parseAlerts({ generated_at: "x", alerts: ALERTS }), ALERTS);
  });

  it("yields [] for malformed payloads", () => {
    assert.deepStrictEqual(parseTopics(null), []);
    assert.deepStrictEqual(parseTopics({}), []);
    assert.deepStrictEqual(parseTopics({ topics: "nope" }), []);
    assert.deepStrictEqual(parseAlerts(undefined), []);
    assert.deepStrictEqual(parseAlerts({ alerts: 42 }), []);
  });
});

describe("matchTopic / findTopic", () => {
  it("hits on a url_pattern substring, case-insensitively", () => {
    const hit = findTopic(
      TOPICS,
      "https://github.com/Example-Org/AGENT-FRAMEWORK/issues/12",
      "some page",
    );
    assert.strictEqual(hit?.slug, "agent-framework-x-发布");
  });

  it("hits on a title_keyword in the page title", () => {
    const hit = findTopic(TOPICS, "https://example.com/blog", "本地模型 Y 走红一周了");
    assert.strictEqual(hit?.slug, "local-model-y");
  });

  it("hits on a title_keyword in the URL when the title misses", () => {
    assert.strictEqual(
      matchTopic(TOPICS[0], "https://news.ycombinator.com/item?id=1&q=agent-framework", "HN"),
      true,
    );
  });

  it("misses unrelated pages", () => {
    assert.strictEqual(findTopic(TOPICS, "https://github.com/other/repo", "Cooking recipes"), undefined);
    assert.strictEqual(matchTopic(TOPICS[1], "https://x.com/home", "今日天气"), false);
  });

  it("returns the first matching topic in file order", () => {
    // Both topics could match via 发布/keywords of #1 vs nothing of #2;
    // a page matching both must yield the earlier entry.
    const both: TopicDataEntry[] = [
      { ...TOPICS[1], title_keywords: ["发布"] },
      TOPICS[0],
    ];
    const hit = findTopic(both, "https://example.com/", "新版本发布");
    assert.strictEqual(hit?.slug, "local-model-y");
  });
});

describe("alerts", () => {
  it("counts alerts and renders badge text like 0.2.x", () => {
    assert.strictEqual(alertCount(ALERTS), 2);
    assert.strictEqual(badgeText(2), "2");
    assert.strictEqual(badgeText(0), "");
    assert.strictEqual(alertCount([]), 0);
  });

  it("finds the alert attached to a topic slug", () => {
    assert.strictEqual(findAlert(ALERTS, "local-model-y")?.reason, "surge");
    assert.strictEqual(findAlert(ALERTS, "no-such-topic"), undefined);
  });
});

describe("topicPageUrl (drift fix)", () => {
  it("uses the breaker-delta-data base and <slug>.html, not topic-<slug>.html", () => {
    const url = topicPageUrl(TOPICS[0]);
    assert.strictEqual(
      url,
      "https://daiyanze.github.io/breaker-delta-data/agent-framework-x-发布.html",
    );
    assert.ok(!url.includes("topic-"));
    assert.ok(!url.includes("/breaker-delta/"));
  });
});

describe("echoes", () => {
  const now = new Date("2026-11-15T01:02:03.000Z");

  it("createEcho builds the stored record shape", () => {
    const echo = createEcho(
      { title: "T", url: "https://example.com/", selectedText: "摘录", note: "理由" },
      now,
      "abc123",
    );
    assert.deepStrictEqual(echo, {
      id: `echo-${now.getTime()}-abc123`,
      title: "T",
      url: "https://example.com/",
      selectedText: "摘录",
      note: "理由",
      capturedAt: "2026-11-15T01:02:03.000Z",
    });
  });

  it("formatIssueText falls back to the selected-text excerpt as the reason", () => {
    const echo = createEcho(
      { title: "T", url: "https://example.com/", selectedText: "选中文本", note: "" },
      now,
      "abc123",
    );
    const text = formatIssueText([echo]);
    assert.ok(text.startsWith("## 投波\n"));
    assert.ok(text.includes("标题：T"));
    assert.ok(text.includes("链接：https://example.com/"));
    assert.ok(text.includes("理由：选中文本"));
    assert.ok(!text.includes("摘录："));
    assert.ok(text.includes("收波时间：2026-11-15T01:02:03.000Z"));
  });

  it("formatIssueText numbers multiple echoes and adds 摘录 when both note and selection exist", () => {
    const mk = (n: number) =>
      createEcho(
        { title: `T${n}`, url: `https://example.com/${n}`, selectedText: "摘录文", note: "我的理由" },
        now,
        `r${n}`,
      );
    const text = formatIssueText([mk(1), mk(2)]);
    assert.ok(text.includes("## 投波 1/2"));
    assert.ok(text.includes("## 投波 2/2"));
    assert.ok(text.includes("理由：我的理由"));
    assert.ok(text.includes("摘录：摘录文"));
  });

  it("formatIssueText marks an unfilled reason", () => {
    const echo = createEcho(
      { title: "", url: "https://example.com/", selectedText: "", note: "" },
      now,
      "abc123",
    );
    const text = formatIssueText([echo]);
    assert.ok(text.includes("标题：(无标题)"));
    assert.ok(text.includes("理由：(未填)"));
  });
});
