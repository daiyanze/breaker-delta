// 浪尖雷达 · 浪高徽章（A2）
// 只在 manifest 声明的 5 个站点运行。数据优先用 background 从实例
// 站点拉回的本地缓存，没有缓存时用扩展自带的 data/topics.json 与
// data/alerts.json 快照。若当前页 URL 或标题命中某个话题，
// 就在页面右下角注入一条不打扰的徽章条。
// 匹配与话题链接构建在 ./logic.ts（话题页 URL 与发布器产物对齐）。
// 不上报任何浏览数据。

import type { AlertEntry, TopicDataEntry } from "@breaker-delta/core";

import {
  findAlert,
  findTopic,
  parseAlerts,
  parseSettings,
  parseTopics,
  pluginScore,
  pluginScoreLabel,
  SITE_BASE,
  topicPageUrl,
} from "./logic.js";

function renderBadge(
  topic: TopicDataEntry,
  alert: AlertEntry | undefined,
  siteBase: string,
): void {
  if (document.getElementById("breaker-delta-badge")) return;
  const bar = document.createElement("div");
  bar.id = "breaker-delta-badge";

  const mark = document.createElement("span");
  mark.className = "bd-badge-mark";
  mark.textContent = "🌊";
  bar.appendChild(mark);

  const body = document.createElement("div");
  body.className = "bd-badge-body";

  const title = document.createElement("div");
  title.className = "bd-badge-title";
  title.textContent = topic.title;
  body.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "bd-badge-meta";
  const heat = document.createElement("b");
  heat.className = "bd-badge-heat";
  heat.textContent = `浪高 ${topic.heat}`;
  meta.append(
    document.createTextNode("浪尖雷达已收录 · "),
    heat,
    document.createTextNode(` · 首现 ${topic.first_seen}`),
  );
  const ps = pluginScore(topic);
  if (ps) {
    meta.appendChild(
      document.createTextNode(` · ${pluginScoreLabel(ps.id)} ${ps.value}`),
    );
  }
  if (alert) {
    const breaking = document.createElement("span");
    breaking.className = "bd-badge-breaking";
    breaking.textContent = "⚡正在破圈";
    meta.appendChild(document.createTextNode(" · "));
    meta.appendChild(breaking);
  }
  body.appendChild(meta);
  bar.appendChild(body);

  const link = document.createElement("a");
  link.className = "bd-badge-link";
  link.href = topicPageUrl(topic, siteBase);
  link.target = "_blank";
  link.rel = "noopener noreferrer nofollow";
  link.textContent = "查看话题 →";
  bar.appendChild(link);

  const close = document.createElement("button");
  close.className = "bd-badge-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "关闭");
  close.addEventListener("click", () => bar.remove());
  bar.appendChild(close);

  document.documentElement.appendChild(bar);
}

async function main(): Promise<void> {
  let topics: TopicDataEntry[] = [];
  let alerts: AlertEntry[] = [];
  let siteBase: string = SITE_BASE;
  // 优先用 background 从实例站点拉回的缓存（设置里的站点地址也在这里读）。
  try {
    const stored = await chrome.storage.local.get(["settings", "dataCache"]);
    siteBase = parseSettings(stored["settings"]).siteBase;
    const cache = stored["dataCache"] as { topics?: unknown; alerts?: unknown } | undefined;
    if (cache) {
      topics = parseTopics(cache.topics);
      alerts = parseAlerts(cache.alerts);
    }
  } catch {
    /* 缓存读不到就用自带快照 */
  }
  if (!topics.length) {
    try {
      const topicsRes = await fetch(chrome.runtime.getURL("data/topics.json"));
      topics = parseTopics(await topicsRes.json());
    } catch {
      /* 数据读不到就不显示徽章 */
    }
    try {
      const alertsRes = await fetch(chrome.runtime.getURL("data/alerts.json"));
      alerts = parseAlerts(await alertsRes.json());
    } catch {
      /* alerts 可选 */
    }
  }

  const topic = findTopic(topics, location.href, document.title);
  if (!topic) return;
  renderBadge(topic, findAlert(alerts, topic.slug), siteBase);
}

if (!document.getElementById("breaker-delta-badge")) {
  void main();
}
