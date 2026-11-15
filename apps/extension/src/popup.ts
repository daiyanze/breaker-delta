// 浪尖雷达 · 收波 — popup 逻辑
// 数据只存 chrome.storage.local，不向任何服务器发送。
// 纯逻辑（echo 构建、Issue 文本格式）在 ./logic.ts。

import {
  createEcho,
  findAlert,
  findTopic,
  formatIssueText,
  parseAlerts,
  parseTopics,
  topicPageUrl,
} from "./logic.js";
import type { Echo } from "./logic.js";

const STORAGE_KEY = "echoes";
const LEGACY_STORAGE_KEY = "echoes"; // pre-rename inbox; migrated on first read

interface TabInfo {
  id?: number;
  title?: string;
  url?: string;
}

let currentTab: TabInfo | null = null;

function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function setStatus(text: string): void {
  const el = $("status");
  el.textContent = text || "";
  el.classList.toggle("show", Boolean(text));
}

async function getEchoes(): Promise<Echo[]> {
  const data = await chrome.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY]);
  if (Array.isArray(data[STORAGE_KEY])) return data[STORAGE_KEY] as Echo[];
  if (Array.isArray(data[LEGACY_STORAGE_KEY])) {
    const legacy = data[LEGACY_STORAGE_KEY] as Echo[];
    await saveEchoes(legacy);
    return legacy;
  }
  return [];
}

async function saveEchoes(echoes: Echo[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: echoes });
}

// 通过 scripting 读当前页的选中文本；失败（如 chrome:// 页面）时返回空字符串。
async function getSelectedText(tabId: number): Promise<string> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString().trim() ?? "",
    });
    return (results && results[0] && (results[0].result as string)) || "";
  } catch {
    return "";
  }
}

function renderEchoes(echoes: Echo[]): void {
  const list = $("echo-list");
  list.innerHTML = "";
  const count = $("echo-count");
  count.textContent = String(echoes.length);
  count.hidden = echoes.length === 0;
  $("empty-hint").style.display = echoes.length ? "none" : "block";

  // 新的在前
  [...echoes].reverse().forEach((echo) => {
    const li = document.createElement("li");

    const title = document.createElement("a");
    title.className = "echo-title";
    title.textContent = echo.title || "(无标题)";
    title.href = echo.url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    li.appendChild(title);

    const url = document.createElement("a");
    url.className = "echo-url";
    url.textContent = echo.url;
    url.href = echo.url;
    url.target = "_blank";
    url.rel = "noopener noreferrer";
    li.appendChild(url);

    if (echo.note) {
      const note = document.createElement("div");
      note.className = "echo-note";
      note.textContent = `💡 ${echo.note}`;
      li.appendChild(note);
    }

    if (echo.selectedText) {
      const excerpt = document.createElement("div");
      excerpt.className = "echo-excerpt";
      excerpt.textContent = echo.selectedText;
      excerpt.title = echo.selectedText;
      li.appendChild(excerpt);
    }

    const meta = document.createElement("div");
    meta.className = "echo-meta";
    const time = document.createElement("span");
    time.className = "echo-time";
    time.textContent = echo.capturedAt ? echo.capturedAt.replace("T", " ").slice(0, 16) : "";
    const del = document.createElement("button");
    del.className = "echo-delete";
    del.textContent = "删除";
    del.addEventListener("click", async () => {
      const all = await getEchoes();
      await saveEchoes(all.filter((s) => s.id !== echo.id));
      renderEchoes(await getEchoes());
      setStatus("已删除一条回波。");
    });
    meta.appendChild(time);
    meta.appendChild(del);
    li.appendChild(meta);

    list.appendChild(li);
  });
}

// 读扩展自带的话题/提醒数据（站点构建生成），失败时静默降级为不显示。
async function loadBundledData(): Promise<{ topics: ReturnType<typeof parseTopics>; alerts: ReturnType<typeof parseAlerts> }> {
  let topics: ReturnType<typeof parseTopics> = [];
  let alerts: ReturnType<typeof parseAlerts> = [];
  try {
    const res = await fetch(chrome.runtime.getURL("data/topics.json"));
    topics = parseTopics(await res.json());
  } catch { /* 数据缺失时不显示匹配卡 */ }
  try {
    const res = await fetch(chrome.runtime.getURL("data/alerts.json"));
    alerts = parseAlerts(await res.json());
  } catch { /* alerts 可选 */ }
  return { topics, alerts };
}

function renderMatch(
  topics: ReturnType<typeof parseTopics>,
  alerts: ReturnType<typeof parseAlerts>,
): void {
  if (!currentTab || !currentTab.url) return;

  const pill = $("alerts-pill") as HTMLElement;
  if (alerts.length) {
    pill.textContent = `⚡ ${alerts.length} 条正在破圈`;
    pill.hidden = false;
  }

  const card = $("match-card");
  const topic = findTopic(topics, currentTab.url, currentTab.title || "");
  if (topic) {
    card.hidden = false;
    card.classList.remove("is-new");
    $("match-badge").textContent = "✓ 已被雷达收录";
    $("match-title").textContent = topic.title;
    const alert = findAlert(alerts, topic.slug);
    $("match-meta").innerHTML = "";
    const meta = document.createElement("span");
    meta.textContent = `首现 ${topic.first_seen}`;
    const heat = document.createElement("span");
    heat.className = "heat";
    heat.textContent = `浪高 ${topic.heat}`;
    $("match-meta").append(heat, document.createTextNode(" · "), meta);
    if (alert) {
      const breaking = document.createElement("span");
      breaking.textContent = " · ⚡正在破圈";
      $("match-meta").appendChild(breaking);
    }
    const link = $("match-link") as HTMLAnchorElement;
    link.href = topicPageUrl(topic);
    link.hidden = false;
  } else if (topics.length) {
    card.hidden = false;
    card.classList.add("is-new");
    $("match-badge").textContent = "尚未被雷达收录";
    $("match-title").textContent = "这个页面不在话题库里";
    $("match-meta").textContent = "觉得它会火的话，先收波观察起来。";
    ($("match-link") as HTMLElement).hidden = true;
  }
}

async function init(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs && tabs[0] ? tabs[0] : null;
  if (currentTab) {
    $("page-title").textContent = currentTab.title || "(无标题)";
    $("page-url").textContent = currentTab.url || "";
  } else {
    $("page-title").textContent = "(无法读取当前标签页)";
  }
  renderEchoes(await getEchoes());

  const { topics, alerts } = await loadBundledData();
  renderMatch(topics, alerts);

  // 若页面上已有选中文本，提前告诉用户收波时会一并保存。
  if (currentTab && currentTab.id !== undefined) {
    const selected = await getSelectedText(currentTab.id);
    if (selected) {
      const hint = $("selection-hint");
      hint.textContent = `✂ 已选中 ${selected.length} 字，收波时会一并保存摘录。`;
      hint.hidden = false;
    }
  }
}

$("capture").addEventListener("click", async () => {
  if (!currentTab || !currentTab.url) {
    setStatus("无法读取当前页面，未收波。");
    return;
  }
  const selectedText =
    currentTab.id !== undefined ? await getSelectedText(currentTab.id) : "";
  const echo = createEcho(
    {
      title: currentTab.title || "",
      url: currentTab.url,
      selectedText,
      note: ($("note") as HTMLInputElement).value.trim(),
    },
    new Date(),
    Math.random().toString(36).slice(2, 8),
  );
  const echoes = await getEchoes();
  echoes.push(echo);
  await saveEchoes(echoes);
  ($("note") as HTMLInputElement).value = "";
  renderEchoes(echoes);
  setStatus(selectedText ? "已收下（含选中文本摘录）。" : "已收下这条回波。");
});

$("export-issue").addEventListener("click", async () => {
  const echoes = await getEchoes();
  if (!echoes.length) {
    setStatus("回波箱是空的，没有可导出的内容。");
    return;
  }
  try {
    await navigator.clipboard.writeText(formatIssueText(echoes));
    setStatus(`已复制 ${echoes.length} 条投波文本，去 GitHub Issue 粘贴即可。`);
  } catch {
    setStatus("复制失败：剪贴板不可用。");
  }
});

$("export-json").addEventListener("click", async () => {
  const echoes = await getEchoes();
  if (!echoes.length) {
    setStatus("回波箱是空的，没有可导出的内容。");
    return;
  }
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), echoes }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "breaker-delta-echoes.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`已下载 ${echoes.length} 条回波（JSON）。`);
});

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
