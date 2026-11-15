// 浪尖雷达 · 收苗 — popup 逻辑
// 数据只存 chrome.storage.local，不向任何服务器发送。
// 纯逻辑（seed 构建、Issue 文本格式）在 ./logic.ts。

import { createSeed, formatIssueText } from "./logic.js";
import type { Seed } from "./logic.js";

const STORAGE_KEY = "seeds";

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
  $("status").textContent = text || "";
}

async function getSeeds(): Promise<Seed[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? (data[STORAGE_KEY] as Seed[]) : [];
}

async function saveSeeds(seeds: Seed[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: seeds });
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

function renderSeeds(seeds: Seed[]): void {
  const list = $("seed-list");
  list.innerHTML = "";
  $("seed-count").textContent = seeds.length ? `（${seeds.length}）` : "";
  $("empty-hint").style.display = seeds.length ? "none" : "block";

  // 新的在前
  [...seeds].reverse().forEach((seed) => {
    const li = document.createElement("li");

    const title = document.createElement("div");
    title.className = "seed-title";
    title.textContent = seed.title || "(无标题)";
    li.appendChild(title);

    const url = document.createElement("div");
    url.className = "seed-url";
    url.textContent = seed.url;
    li.appendChild(url);

    if (seed.note) {
      const note = document.createElement("div");
      note.className = "seed-note";
      note.textContent = seed.note;
      li.appendChild(note);
    }

    const meta = document.createElement("div");
    meta.className = "seed-meta";
    const time = document.createElement("span");
    time.className = "seed-time";
    time.textContent = seed.capturedAt ? seed.capturedAt.replace("T", " ").slice(0, 16) : "";
    const del = document.createElement("button");
    del.className = "seed-delete";
    del.textContent = "删除";
    del.addEventListener("click", async () => {
      const all = await getSeeds();
      await saveSeeds(all.filter((s) => s.id !== seed.id));
      renderSeeds(await getSeeds());
      setStatus("已删除一条苗头。");
    });
    meta.appendChild(time);
    meta.appendChild(del);
    li.appendChild(meta);

    list.appendChild(li);
  });
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
  renderSeeds(await getSeeds());
}

$("capture").addEventListener("click", async () => {
  if (!currentTab || !currentTab.url) {
    setStatus("无法读取当前页面，未收苗。");
    return;
  }
  const selectedText =
    currentTab.id !== undefined ? await getSelectedText(currentTab.id) : "";
  const seed = createSeed(
    {
      title: currentTab.title || "",
      url: currentTab.url,
      selectedText,
      note: ($("note") as HTMLInputElement).value.trim(),
    },
    new Date(),
    Math.random().toString(36).slice(2, 8),
  );
  const seeds = await getSeeds();
  seeds.push(seed);
  await saveSeeds(seeds);
  ($("note") as HTMLInputElement).value = "";
  renderSeeds(seeds);
  setStatus(selectedText ? "已收下（含选中文本摘录）。" : "已收下这个苗头。");
});

$("export-issue").addEventListener("click", async () => {
  const seeds = await getSeeds();
  if (!seeds.length) {
    setStatus("苗头箱是空的，没有可导出的内容。");
    return;
  }
  try {
    await navigator.clipboard.writeText(formatIssueText(seeds));
    setStatus(`已复制 ${seeds.length} 条投苗文本，去 GitHub Issue 粘贴即可。`);
  } catch {
    setStatus("复制失败：剪贴板不可用。");
  }
});

$("export-json").addEventListener("click", async () => {
  const seeds = await getSeeds();
  if (!seeds.length) {
    setStatus("苗头箱是空的，没有可导出的内容。");
    return;
  }
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), seeds }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "breaker-delta-seeds.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`已下载 ${seeds.length} 条苗头（JSON）。`);
});

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
