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
  buildIssueUrl,
  createEcho,
  DEFAULT_SETTINGS,
  findAlert,
  findTopic,
  formatIssueBody,
  formatIssueText,
  matchTopic,
  normalizeDataRepo,
  normalizeSiteBase,
  parseAlerts,
  parseSettings,
  parseTopics,
  pendingEchoes,
  pluginScore,
  pluginScoreLabel,
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

describe("pluginScore (Plugin-P2 consumer contract)", () => {
  it("reads the first numeric score from the plugins namespace", () => {
    const topic = {
      ...TOPICS[0],
      plugins: { tickers: { entities: [{ type: "ticker", name: "NVDA" }] }, momentum: { score: 73 } },
    } as TopicDataEntry;
    assert.deepStrictEqual(pluginScore(topic), { id: "momentum", value: 73 });
    assert.strictEqual(pluginScoreLabel("momentum"), "动量");
    assert.strictEqual(pluginScoreLabel("other"), "other");
  });

  it("is null without plugin data or scores", () => {
    assert.strictEqual(pluginScore(TOPICS[0]), null);
    const topic = { ...TOPICS[0], plugins: { tickers: { entities: [] } } } as TopicDataEntry;
    assert.strictEqual(pluginScore(topic), null);
  });
});

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

describe("settings", () => {
  it("parseSettings falls back to defaults for missing or malformed input", () => {
    assert.deepStrictEqual(parseSettings(undefined), DEFAULT_SETTINGS);
    assert.deepStrictEqual(parseSettings(null), DEFAULT_SETTINGS);
    assert.deepStrictEqual(parseSettings({ dataRepo: 42, siteBase: "not a url" }), DEFAULT_SETTINGS);
  });

  it("parseSettings keeps valid values and boolean semantics", () => {
    const s = parseSettings({
      dataRepo: "me/my-data",
      siteBase: "https://example.com/radar",
      openIssueAfterCapture: true,
      keepLocalAfterSubmit: false,
    });
    assert.strictEqual(s.dataRepo, "me/my-data");
    assert.strictEqual(s.siteBase, "https://example.com/radar/");
    assert.strictEqual(s.openIssueAfterCapture, true);
    assert.strictEqual(s.keepLocalAfterSubmit, false);
    // keepLocalAfterSubmit defaults to true unless explicitly false
    assert.strictEqual(parseSettings({}).keepLocalAfterSubmit, true);
  });

  it("normalizeDataRepo accepts owner/repo and github.com URLs, rejects junk", () => {
    assert.strictEqual(normalizeDataRepo("daiyanze/breaker-delta-data"), "daiyanze/breaker-delta-data");
    assert.strictEqual(normalizeDataRepo(" https://github.com/me/repo.git "), "me/repo");
    assert.strictEqual(normalizeDataRepo("me/repo/"), "me/repo");
    assert.strictEqual(normalizeDataRepo("no-slash"), DEFAULT_SETTINGS.dataRepo);
    assert.strictEqual(normalizeDataRepo("a/b/c"), DEFAULT_SETTINGS.dataRepo);
    assert.strictEqual(normalizeDataRepo(""), DEFAULT_SETTINGS.dataRepo);
  });

  it("normalizeSiteBase requires http(s) and forces a trailing slash", () => {
    assert.strictEqual(normalizeSiteBase("https://example.com/x"), "https://example.com/x/");
    assert.strictEqual(normalizeSiteBase("https://example.com/x/"), "https://example.com/x/");
    assert.strictEqual(normalizeSiteBase("ftp://example.com/"), DEFAULT_SETTINGS.siteBase);
    assert.strictEqual(normalizeSiteBase("example.com"), DEFAULT_SETTINGS.siteBase);
  });

  it("topicPageUrl honours a custom site base", () => {
    assert.strictEqual(
      topicPageUrl(TOPICS[0], "https://example.com/radar/"),
      "https://example.com/radar/agent-framework-x-发布.html",
    );
  });
});

describe("one-click submit (投波)", () => {
  const now = new Date("2026-11-15T01:02:03.000Z");
  const echo = createEcho(
    { title: "新工具发布", url: "https://example.com/post", selectedText: "摘录内容", note: "值得关注" },
    now,
    "abc123",
  );

  it("buildIssueUrl targets the data repo with the echo template and prefilled fields", () => {
    const url = buildIssueUrl(echo, "daiyanze/breaker-delta-data");
    assert.ok(url.startsWith("https://github.com/daiyanze/breaker-delta-data/issues/new?"));
    const params = new URL(url).searchParams;
    assert.strictEqual(params.get("template"), "echo.md");
    assert.strictEqual(params.get("title"), "🌀 投波：新工具发布");
    const body = params.get("body") ?? "";
    assert.ok(body.includes("标题：新工具发布"));
    assert.ok(body.includes("链接：https://example.com/post"));
    assert.ok(body.includes("理由：值得关注"));
    assert.ok(body.includes("摘录：摘录内容"));
  });

  it("buildIssueUrl normalizes a junk repo back to the default", () => {
    const url = buildIssueUrl(echo, "junk");
    assert.ok(url.startsWith(`https://github.com/${DEFAULT_SETTINGS.dataRepo}/issues/new?`));
  });

  it("buildIssueUrl keeps very long excerpts under the URL length cap", () => {
    const big = createEcho(
      { title: "T", url: "https://example.com/", selectedText: "长".repeat(20000), note: "理由" },
      now,
      "big1",
    );
    const url = buildIssueUrl(big, "daiyanze/breaker-delta-data");
    assert.ok(url.length <= 7500, `url length ${url.length}`);
    const body = new URL(url).searchParams.get("body") ?? "";
    assert.ok(body.includes("理由：理由"));
  });

  it("formatIssueBody caps the excerpt at the given budget", () => {
    const body = formatIssueBody(echo, 3);
    assert.ok(body.includes("摘录：摘录内…"));
  });

  it("pendingEchoes returns only echoes never submitted", () => {
    const done = { ...echo, id: "done", issueOpenedAt: "2026-11-15T02:00:00.000Z" };
    assert.deepStrictEqual(pendingEchoes([echo, done]).map((e) => e.id), [echo.id]);
    assert.deepStrictEqual(pendingEchoes([done]), []);
  });
});
