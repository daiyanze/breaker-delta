// 浪尖雷达 · 收波 — popup 逻辑
// 数据只存 chrome.storage.local，不向任何服务器发送。
// 纯逻辑（echo 构建、Issue 文本格式）在 ./logic.ts。

import {
  buildIssueUrl,
  createEcho,
  DEFAULT_SETTINGS,
  findAlert,
  findTopic,
  formatIssueText,
  parseAlerts,
  parseSettings,
  parseTopics,
  pendingEchoes,
  topicPageUrl,
} from "./logic.js";
import type { Echo, Settings } from "./logic.js";

const STORAGE_KEY = "echoes";
const LEGACY_STORAGE_KEY = "echoes"; // pre-rename inbox; migrated on first read
const SETTINGS_KEY = "settings";
const DATA_CACHE_KEY = "dataCache";

let settings: Settings = DEFAULT_SETTINGS;

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

async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return parseSettings(data[SETTINGS_KEY]);
}

/**
 * One-click 投波： open the data repo's "new issue" page with the
 * echo.md template and this echo's fields already filled in. The
 * user only clicks Submit on GitHub. Afterwards the echo is marked
 * (or removed, per the keep-local setting); the extension cannot
 * observe whether the user actually submitted.
 */
async function submitEcho(echo: Echo): Promise<void> {
  await chrome.tabs.create({ url: buildIssueUrl(echo, settings.dataRepo) });
  const all = await getEchoes();
  if (settings.keepLocalAfterSubmit) {
    await saveEchoes(
      all.map((e) =>
        e.id === echo.id ? { ...e, issueOpenedAt: new Date().toISOString() } : e,
      ),
    );
  } else {
    await saveEchoes(all.filter((e) => e.id !== echo.id));
  }
  renderEchoes(await getEchoes());
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

    if (echo.issueOpenedAt) {
      const submitted = document.createElement("div");
      submitted.className = "echo-submitted";
      submitted.textContent = `✓ 已打开投波页 ${echo.issueOpenedAt.replace("T", " ").slice(0, 16)}（在 GitHub 点 Submit 才算提交成功）`;
      li.appendChild(submitted);
    }

    const meta = document.createElement("div");
    meta.className = "echo-meta";
    const time = document.createElement("span");
    time.className = "echo-time";
    time.textContent = echo.capturedAt ? echo.capturedAt.replace("T", " ").slice(0, 16) : "";
    const actions = document.createElement("span");
    actions.className = "echo-actions";
    const submit = document.createElement("button");
    submit.className = "echo-submit";
    submit.textContent = echo.issueOpenedAt ? "再次投波" : "🌀 投波";
    submit.addEventListener("click", async () => {
      await submitEcho(echo);
      setStatus("已打开预填好的投波页，去 GitHub 点 Submit 即可提交。");
    });
    const del = document.createElement("button");
    del.className = "echo-delete";
    del.textContent = "删除";
    del.addEventListener("click", async () => {
      const all = await getEchoes();
      await saveEchoes(all.filter((s) => s.id !== echo.id));
      renderEchoes(await getEchoes());
      setStatus("已删除一条回波。");
    });
    actions.appendChild(submit);
    actions.appendChild(del);
    meta.appendChild(time);
    meta.appendChild(actions);
    li.appendChild(meta);

    list.appendChild(li);
  });
}

// 读扩展自带的话题/提醒数据（打包快照），失败时静默降级为不显示。
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

interface DataCache {
  topics?: unknown;
  alerts?: unknown;
  fetchedAt?: string;
}

// 数据优先级：实例站点实时拉取 → 本地缓存 → 打包快照。
// 实时拉取成功后顺手刷新缓存，background 的角标也跟着新。
async function loadData(): Promise<{ topics: ReturnType<typeof parseTopics>; alerts: ReturnType<typeof parseAlerts> }> {
  try {
    const res = await fetch(`${settings.siteBase}data/topics.json`, { cache: "no-store" });
    if (res.ok) {
      const payload: unknown = await res.json();
      const topics = parseTopics(payload);
      if (topics.length) {
        let alertsPayload: unknown = null;
        let alerts: ReturnType<typeof parseAlerts> = [];
        try {
          const ares = await fetch(`${settings.siteBase}data/alerts.json`, { cache: "no-store" });
          if (ares.ok) {
            alertsPayload = await ares.json();
            alerts = parseAlerts(alertsPayload);
          }
        } catch { /* alerts 可选 */ }
        await chrome.storage.local.set({
          [DATA_CACHE_KEY]: { topics: payload, alerts: alertsPayload, fetchedAt: new Date().toISOString() },
        });
        return { topics, alerts };
      }
    }
  } catch { /* 站点不可达时降级 */ }
  try {
    const stored = await chrome.storage.local.get(DATA_CACHE_KEY);
    const cache = stored[DATA_CACHE_KEY] as DataCache | undefined;
    if (cache) {
      const topics = parseTopics(cache.topics);
      if (topics.length) return { topics, alerts: parseAlerts(cache.alerts) };
    }
  } catch { /* 缓存损坏时降级 */ }
  return loadBundledData();
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
    link.href = topicPageUrl(topic, settings.siteBase);
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
  settings = await loadSettings();
  // 设置链接同时写上真实地址：万一点击处理没生效，链接本身也能打开。
  const settingsLink = $("open-settings") as HTMLAnchorElement;
  settingsLink.href = chrome.runtime.getURL("options.html");
  settingsLink.target = "_blank";
  settingsLink.rel = "noopener noreferrer";
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs && tabs[0] ? tabs[0] : null;
  if (currentTab) {
    $("page-title").textContent = currentTab.title || "(无标题)";
    $("page-url").textContent = currentTab.url || "";
  } else {
    $("page-title").textContent = "(无法读取当前标签页)";
  }
  renderEchoes(await getEchoes());

  const { topics, alerts } = await loadData();
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
  if (settings.openIssueAfterCapture) {
    await submitEcho(echo);
    setStatus("已收下，并打开了预填好的投波页，去 GitHub 点 Submit 即可。");
  }
});

$("submit-all").addEventListener("click", async () => {
  const echoes = await getEchoes();
  const pending = pendingEchoes(echoes);
  if (!pending.length) {
    setStatus(echoes.length ? "回波箱里的回波都已经打开过投波页了。" : "回波箱是空的，没有可投波的内容。");
    return;
  }
  const urls = pending.map((e) => buildIssueUrl(e, settings.dataRepo));
  // 先落标记再开页：popup 在新标签打开后会关闭，后台服务负责逐条打开。
  if (settings.keepLocalAfterSubmit) {
    const now = new Date().toISOString();
    const ids = new Set(pending.map((e) => e.id));
    await saveEchoes(echoes.map((e) => (ids.has(e.id) ? { ...e, issueOpenedAt: now } : e)));
  } else {
    const ids = new Set(pending.map((e) => e.id));
    await saveEchoes(echoes.filter((e) => !ids.has(e.id)));
  }
  renderEchoes(await getEchoes());
  setStatus(`正在逐条打开 ${urls.length} 个投波页…`);
  try {
    await chrome.runtime.sendMessage({ type: "open-issues", urls });
  } catch {
    await chrome.tabs.create({ url: urls[0] });
  }
});

$("open-settings").addEventListener("click", async (event) => {
  event.preventDefault();
  // 首选 openOptionsPage；它在个别 Chrome 版本/场景下会静默失败或
  // 返回 rejected promise，失败时直接用新标签页打开设置页兜底。
  try {
    const maybePromise = chrome.runtime.openOptionsPage() as unknown as
      | Promise<void>
      | undefined;
    if (maybePromise && typeof maybePromise.catch === "function") {
      await maybePromise;
      return;
    }
    if (maybePromise === undefined) return;
  } catch {
    /* 落到下面的兜底 */
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
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
