// 浪尖雷达 · 后台 service worker（C1 角标提醒）
// 不做任何远程轮询。只在安装/浏览器启动时读取扩展自带的
// data/alerts.json（由站点构建生成），把提醒条数显示在扩展图标
// 角标上。计数与角标文本规则在 ./logic.ts。

import { alertCount, badgeText, parseAlerts } from "./logic.js";

async function refreshBadgeFromBundledAlerts(): Promise<void> {
  try {
    const res = await fetch(chrome.runtime.getURL("data/alerts.json"));
    const data: unknown = await res.json();
    const count = alertCount(parseAlerts(data));
    await chrome.action.setBadgeText({ text: badgeText(count) });
    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: "#d97706" });
    }
  } catch {
    await chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void refreshBadgeFromBundledAlerts();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshBadgeFromBundledAlerts();
});
