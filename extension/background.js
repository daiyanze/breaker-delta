'use strict';

// 浪尖雷达 · 后台 service worker（C1 角标提醒原型）
// 不做任何远程轮询。只在安装/浏览器启动时读取扩展自带的
// data/alerts.json（样例数据；正式版将改为读取站点发布的静态
// alerts JSON），把提醒条数显示在扩展图标角标上。

async function refreshBadgeFromBundledAlerts() {
  try {
    const res = await fetch(chrome.runtime.getURL('data/alerts.json'));
    const data = await res.json();
    const count = Array.isArray(data.alerts) ? data.alerts.length : 0;
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
    }
  } catch (e) {
    await chrome.action.setBadgeText({ text: '' });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  refreshBadgeFromBundledAlerts();
});

chrome.runtime.onStartup.addListener(() => {
  refreshBadgeFromBundledAlerts();
});
