// 浪尖雷达 · 浪高徽章（A2）
// 只在 manifest 声明的 5 个站点运行。读取扩展自带的 data/topics.json 与
// data/alerts.json（由站点构建生成），若当前页 URL 或标题命中某个话题，
// 就在页面右下角注入一条不打扰的徽章条。
// 匹配与话题链接构建在 ./logic.ts（话题页 URL 与发布器产物对齐）。
// 不上报任何浏览数据。

import type { AlertEntry, TopicDataEntry } from "@breaker-delta/core";

import { findAlert, findTopic, parseAlerts, parseTopics, topicPageUrl } from "./logic.js";

function renderBadge(topic: TopicDataEntry, alert: AlertEntry | undefined): void {
  if (document.getElementById("breaker-delta-badge")) return;
  const bar = document.createElement("div");
  bar.id = "breaker-delta-badge";

  const main = document.createElement("span");
  main.className = "bd-badge-main";
  main.textContent = `🌊 浪尖雷达已收录 · 浪高 ${topic.heat} · 首现 ${topic.first_seen}`;
  bar.appendChild(main);

  if (alert) {
    const breaking = document.createElement("span");
    breaking.className = "bd-badge-breaking";
    breaking.textContent = "⚡正在破圈";
    bar.appendChild(breaking);
  }

  const link = document.createElement("a");
  link.className = "bd-badge-link";
  link.href = topicPageUrl(topic);
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

  const topic = findTopic(topics, location.href, document.title);
  if (!topic) return;
  renderBadge(topic, findAlert(alerts, topic.slug));
}

if (!document.getElementById("breaker-delta-badge")) {
  void main();
}
