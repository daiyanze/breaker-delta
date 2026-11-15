// 浪尖雷达 · 收波 — 设置页逻辑
// 设置只存 chrome.storage.local（键 "settings"），popup / background /
// content 都通过 logic.ts 的 parseSettings 读同一份。

import {
  DEFAULT_SETTINGS,
  normalizeDataRepo,
  normalizeSiteBase,
  parseAlerts,
  parseSettings,
  parseTopics,
} from "./logic.js";
import type { Settings } from "./logic.js";

const SETTINGS_KEY = "settings";
const DATA_CACHE_KEY = "dataCache";

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function setStatus(text: string): void {
  const el = $("status");
  el.textContent = text || "";
  el.classList.toggle("show", Boolean(text));
}

async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return parseSettings(data[SETTINGS_KEY]);
}

function fillForm(settings: Settings): void {
  ($("data-repo") as HTMLInputElement).value = settings.dataRepo;
  ($("site-base") as HTMLInputElement).value = settings.siteBase;
  ($("open-after-capture") as HTMLInputElement).checked = settings.openIssueAfterCapture;
  ($("keep-local") as HTMLInputElement).checked = settings.keepLocalAfterSubmit;
}

function readForm(): Settings {
  return {
    dataRepo: normalizeDataRepo(($("data-repo") as HTMLInputElement).value),
    siteBase: normalizeSiteBase(($("site-base") as HTMLInputElement).value),
    openIssueAfterCapture: ($("open-after-capture") as HTMLInputElement).checked,
    keepLocalAfterSubmit: ($("keep-local") as HTMLInputElement).checked,
  };
}

async function renderDataInfo(): Promise<void> {
  const el = $("data-info");
  const data = await chrome.storage.local.get(DATA_CACHE_KEY);
  const cache = data[DATA_CACHE_KEY] as
    | { topics?: unknown; alerts?: unknown; fetchedAt?: string }
    | undefined;
  if (cache && cache.fetchedAt) {
    const topicCount = parseTopics(cache.topics).length;
    const alertCount = parseAlerts(cache.alerts).length;
    el.textContent =
      `当前缓存：${topicCount} 个话题、${alertCount} 条破圈提醒，` +
      `拉取于 ${cache.fetchedAt.replace("T", " ").slice(0, 16)}（UTC）。`;
  } else {
    el.textContent = "当前还没有从实例站点拉到数据，正在用扩展自带的快照。";
  }
}

async function init(): Promise<void> {
  fillForm(await loadSettings());
  await renderDataInfo();
}

$("save").addEventListener("click", async () => {
  const settings = readForm();
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  fillForm(settings);
  try {
    await chrome.runtime.sendMessage({ type: "refresh-data" });
  } catch { /* background 未就绪时下次启动也会刷新 */ }
  await renderDataInfo();
  setStatus("设置已保存。");
});

$("reset").addEventListener("click", async () => {
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS } });
  fillForm(DEFAULT_SETTINGS);
  setStatus("已恢复并保存默认设置。");
});

$("refresh-data").addEventListener("click", async () => {
  setStatus("正在从实例站点刷新…");
  try {
    await chrome.runtime.sendMessage({ type: "refresh-data" });
  } catch { /* 忽略：下方按缓存现状汇报 */ }
  await renderDataInfo();
  setStatus("数据刷新完成（拉不到时仍用旧缓存或自带快照）。");
});

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
