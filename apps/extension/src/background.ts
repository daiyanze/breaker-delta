// 浪尖雷达 · 后台 service worker
// 职责：
// 1. 数据刷新（C1 角标的数据来源）：安装/启动/设置页手动触发时，从
//    设置里的实例站点拉取 data/topics.json 与 data/alerts.json 存入
//    本地缓存（dataCache），角标显示缓存里的破圈条数；拉不到时依次
//    降级为旧缓存、扩展自带快照。除了用户配置的实例站点，不访问
//    任何其他服务器，更不上报任何数据。
// 2. 逐条投波：popup 打开第一个投波页后就会关闭，剩下的预填 Issue
//    页由这里逐条打开。

import { alertCount, badgeText, parseAlerts, parseSettings } from "./logic.js";

const SETTINGS_KEY = "settings";
const DATA_CACHE_KEY = "dataCache";

async function setBadge(alerts: ReturnType<typeof parseAlerts>): Promise<void> {
  const count = alertCount(alerts);
  await chrome.action.setBadgeText({ text: badgeText(count) });
  if (count > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: "#d97706" });
  }
}

async function bundledAlerts(): Promise<ReturnType<typeof parseAlerts>> {
  try {
    const res = await fetch(chrome.runtime.getURL("data/alerts.json"));
    return parseAlerts(await res.json());
  } catch {
    return [];
  }
}

async function refreshData(): Promise<void> {
  let alerts: ReturnType<typeof parseAlerts> = [];
  try {
    const stored = await chrome.storage.local.get([SETTINGS_KEY, DATA_CACHE_KEY]);
    const settings = parseSettings(stored[SETTINGS_KEY]);
    try {
      const tres = await fetch(`${settings.siteBase}data/topics.json`, { cache: "no-store" });
      if (!tres.ok) throw new Error("topics fetch failed");
      const topicsPayload: unknown = await tres.json();
      let alertsPayload: unknown = null;
      try {
        const ares = await fetch(`${settings.siteBase}data/alerts.json`, { cache: "no-store" });
        if (ares.ok) alertsPayload = await ares.json();
      } catch { /* alerts 可选 */ }
      await chrome.storage.local.set({
        [DATA_CACHE_KEY]: {
          topics: topicsPayload,
          alerts: alertsPayload,
          fetchedAt: new Date().toISOString(),
        },
      });
      alerts = parseAlerts(alertsPayload);
    } catch {
      const cache = stored[DATA_CACHE_KEY] as { alerts?: unknown } | undefined;
      alerts = cache ? parseAlerts(cache.alerts) : await bundledAlerts();
    }
  } catch {
    alerts = await bundledAlerts();
  }
  await setBadge(alerts);
}

chrome.runtime.onInstalled.addListener(() => {
  void refreshData();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshData();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "refresh-data") {
    void refreshData();
  }
  if (message?.type === "open-issues" && Array.isArray(message.urls)) {
    message.urls.forEach((url, i) => {
      setTimeout(() => {
        void chrome.tabs.create({ url, active: i === 0 });
      }, i * 600);
    });
  }
});
