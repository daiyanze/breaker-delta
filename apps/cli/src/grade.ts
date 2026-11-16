// Built-in LLM grading (P1d) — the fallback path for instances
// with no external agent. The mainline stays the agent flow
// (scan → the agent grades with the Skill → record/publish); this
// module implements the same contract against an
// OpenAI-compatible chat endpoint with the instance's own key:
//
//   candidates file -> prompt (methodology rules + preset brief
//   + panel-plugin field requirements) -> LLM JSON -> strict
//   validation -> edition file + ledger record (applyRecord).
//
// The key comes from an environment variable named in the config
// (grading.api_key_env, default BREAKER_DELTA_LLM_API_KEY) and is
// never read from config files or logged. A failed or invalid
// grading writes nothing.

import * as fs from "node:fs";
import * as path from "node:path";

import { loadStore } from "@breaker-delta/core";

import { applyRecord } from "./commands.js";
import { statePath, type CliContext } from "./context.js";
import { resolvePanelPlugins } from "./plugins.js";

export interface GradingConfig {
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  auto: boolean;
}

/** config.grading -> GradingConfig, or null when not configured. */
export function gradingConfigFrom(config: Record<string, unknown>): GradingConfig | null {
  const g = config.grading as Record<string, unknown> | undefined;
  if (!g || typeof g !== "object") return null;
  const model = typeof g.model === "string" ? g.model : "";
  if (model === "") return null;
  return {
    baseUrl: (typeof g.base_url === "string" && g.base_url !== ""
      ? g.base_url
      : "https://api.openai.com/v1"
    ).replace(/\/+$/, ""),
    model,
    apiKeyEnv:
      typeof g.api_key_env === "string" && g.api_key_env !== ""
        ? g.api_key_env
        : "BREAKER_DELTA_LLM_API_KEY",
    auto: g.auto === true,
  };
}

const LEVELS = new Set(["must", "watch", "echo"]);

export interface GradeResult {
  file: string;
  items: number;
  created: number;
  updated: number;
  model: string;
}

function findCandidatesFile(ctx: CliContext, slot: string, explicit?: string): string {
  if (explicit) return explicit;
  const stateDir = path.join(ctx.dataDir, "state");
  const names = fs.existsSync(stateDir)
    ? fs
        .readdirSync(stateDir)
        .filter((f) => f.startsWith("candidates-") && f.endsWith(`-${slot}.json`))
        .sort()
    : [];
  if (names.length === 0) {
    throw new Error(
      `grade: no candidates file for slot "${slot}" under ${stateDir} — run scan first`,
    );
  }
  return path.join(stateDir, names[names.length - 1]);
}

function findBrief(ctx: CliContext, configFile: string | null, preset: string | null): string {
  const candidates: string[] = [];
  if (configFile) candidates.push(path.join(path.dirname(configFile), "brief.md"));
  if (preset) candidates.push(path.join(ctx.rootDir, "presets", preset, "brief.md"));
  candidates.push(path.join(ctx.dataDir, "brief.md"));
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const text = fs.readFileSync(p, "utf-8").trim();
      if (text) return text.slice(0, 6000);
    }
  }
  return "";
}

interface PanelRequirement {
  id: string;
  fields: { field: string; label: string }[];
}

function panelRequirements(ctx: CliContext, config: Record<string, unknown>): PanelRequirement[] {
  const out: PanelRequirement[] = [];
  for (const def of resolvePanelPlugins(ctx, config, true)) {
    if (!def.requiresData) continue;
    const fields: { field: string; label: string }[] = [];
    for (const b of def.blocks) {
      if (b.type !== "fields") continue;
      for (const it of b.items) {
        fields.push({ field: it.field, label: it.label.zh ?? it.label.en ?? it.field });
      }
    }
    if (fields.length > 0) out.push({ id: def.id, fields });
  }
  return out;
}

const SYSTEM_RULES = [
  "You are the grading editor of a topic radar. You receive one scan's candidate items (grouped by source) plus the topics the radar already tracks, and you produce the edition: the 5-8 topics that matter, graded and written up.",
  "",
  "Rules (the radar's methodology, non-negotiable):",
  "- A topic needs support from at least 2 independent sources to be graded must （必看） or watch （关注）. A single-source item is at most echo （回波）.",
  "- Merge candidates about the same event into one topic. If a candidate continues a topic the radar already tracks, reuse that topic's exact existing title as the item title (the radar links appearances by title).",
  "- Write every item in Chinese first (title, body, action), plus translations in an i18n object: i18n.en and i18n.ja, each {title, body, action}.",
  "- body: 2-4 sentences, factual, only facts present in the candidates. Never invent numbers, dates, quotes or links.",
  "- action: one concrete suggestion for a reader (what to try, read, or watch), one sentence.",
  "- sources: the candidate source names that support the topic (use the exact source ids from the input). links: the supporting candidate URLs.",
  "- is_new: false when the topic matches an already-tracked topic, true otherwise.",
  "- Prefer fewer, stronger topics: 5-8 items total, at most 3 must.",
  "",
  "Output: a single JSON object {\"items\": [...]} and nothing else. Each item: {level: \"must\"|\"watch\"|\"echo\", title, body, action, i18n: {en: {title, body, action}, ja: {title, body, action}}, sources: [..], links: [..], is_new: bool}.",
].join("\n");

function buildPrompt(
  candidates: Record<string, unknown>,
  knownTopics: string[],
  brief: string,
  panels: PanelRequirement[],
): { system: string; user: string } {
  let system = SYSTEM_RULES;
  if (brief) system += `\n\nInstance brief (the preset's editorial guidance):\n${brief}`;
  if (panels.length > 0) {
    const lines = panels.map(
      (p) =>
        `- plugins.${p.id}: an object with fields ${p.fields
          .map((f) => `${f.field} (${f.label})`)
          .join(", ")} — string values, or arrays of strings for list-like fields.`,
    );
    system +=
      "\n\nPanel plugin data: when an item genuinely fits a plugin below, add a \"plugins\" object to the item with that plugin's structured data. Omit the plugin entirely when it does not apply — never fill it with generic text.\n" +
      lines.join("\n");
  }
  const sources = (candidates.sources as Record<string, unknown>[] | undefined) ?? [];
  const compact = {
    edition: candidates.edition,
    sources: sources.map((s) => ({
      source: s.source,
      layer: s.layer,
      status: s.status,
      items: ((s.items as Record<string, unknown>[] | undefined) ?? []).map((it) => ({
        name: it.name,
        url: it.url,
        detail: typeof it.detail === "string" ? it.detail.slice(0, 400) : it.detail,
        metrics: it.metrics,
      })),
    })),
    resonance: candidates.resonance,
    keyword_alerts: candidates.keyword_alerts,
  };
  const user =
    `Already-tracked topics (reuse exact titles for follow-ups):\n${JSON.stringify(knownTopics)}\n\n` +
    `Candidates:\n${JSON.stringify(compact)}`;
  return { system, user };
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

async function callLlm(
  grading: GradingConfig,
  apiKey: string,
  system: string,
  user: string,
): Promise<string> {
  const res = await fetch(`${grading.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: grading.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`grade: LLM endpoint returned ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("grade: LLM response has no message content");
  }
  return content;
}

export interface GradedItem {
  level: string;
  title: string;
  body: string;
  action: string;
  i18n?: {
    en?: { title?: string; body?: string; action?: string };
    ja?: { title?: string; body?: string; action?: string };
  };
  sources: string[];
  links: string[];
  is_new: boolean;
  plugins?: Record<string, Record<string, unknown>>;
}

/** Strict validation of the model's items: anything off-contract
 *  fails the whole grading (no partial editions). */
export function validateGradedItems(raw: unknown): GradedItem[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(
        `grade: LLM output is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  const items = Array.isArray(parsed)
    ? parsed
    : (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) {
    throw new Error("grade: LLM output must be a JSON object with an items array");
  }
  if (items.length === 0) throw new Error("grade: LLM produced zero items");
  if (items.length > 12) throw new Error(`grade: LLM produced ${items.length} items (max 12)`);
  return items.map((it, i) => {
    const e = it as Record<string, unknown>;
    const bad = (why: string): Error => new Error(`grade: item ${i}: ${why}`);
    if (typeof e.title !== "string" || e.title.trim() === "") throw bad("title must be a non-empty string");
    if (typeof e.level !== "string" || !LEVELS.has(e.level)) throw bad("level must be must|watch|echo");
    if (typeof e.body !== "string" || e.body.trim() === "") throw bad("body must be a non-empty string");
    if (!Array.isArray(e.sources) || e.sources.length === 0 || e.sources.some((s) => typeof s !== "string")) {
      throw bad("sources must be a non-empty string array");
    }
    const item: GradedItem = {
      level: e.level,
      title: e.title,
      body: e.body,
      action: typeof e.action === "string" ? e.action : "",
      sources: e.sources as string[],
      links: Array.isArray(e.links) ? (e.links as unknown[]).filter((x): x is string => typeof x === "string") : [],
      is_new: e.is_new !== false,
    };
    if (e.i18n && typeof e.i18n === "object" && !Array.isArray(e.i18n)) {
      item.i18n = e.i18n as GradedItem["i18n"];
    }
    if (e.plugins && typeof e.plugins === "object" && !Array.isArray(e.plugins)) {
      item.plugins = e.plugins as Record<string, Record<string, unknown>>;
    }
    return item;
  });
}

export async function runGrade(
  ctx: CliContext,
  config: Record<string, unknown>,
  configFile: string | null,
  preset: string | null,
  opts: { slot: string; date?: string; file?: string; replace?: boolean },
): Promise<GradeResult> {
  const grading = gradingConfigFrom(config);
  if (!grading) {
    throw new Error(
      "grade: no grading config — set grading.model (and optionally grading.base_url / grading.api_key_env) in the instance config; the API key itself comes from the environment",
    );
  }
  const apiKey = process.env[grading.apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `grade: API key environment variable ${grading.apiKeyEnv} is not set (the key never lives in config files)`,
    );
  }
  const candPath = findCandidatesFile(ctx, opts.slot, opts.file);
  const candidates = JSON.parse(fs.readFileSync(candPath, "utf-8")) as Record<string, unknown>;
  const store = loadStore(statePath(ctx));
  const knownTopics = store.topics.map((t) => t.name);
  const brief = findBrief(ctx, configFile, preset);
  const panels = panelRequirements(ctx, config);
  const { system, user } = buildPrompt(candidates, knownTopics, brief, panels);
  const content = await callLlm(grading, apiKey, system, user);
  const items = validateGradedItems(content);

  const date =
    opts.date ??
    (() => {
      const m = /candidates-(\d{4})(\d{2})(\d{2})-/.exec(path.basename(candPath));
      return m ? `${m[1]}-${m[2]}-${m[3]}` : new Date().toISOString().slice(0, 10);
    })();
  const editionsDir = path.join(ctx.dataDir, "editions");
  const file = path.join(editionsDir, `${date}-${opts.slot}.json`);
  if (fs.existsSync(file) && !opts.replace) {
    throw new Error(`grade: ${date}-${opts.slot}.json already exists (pass --replace to overwrite)`);
  }
  const missing = ((candidates.sources as Record<string, unknown>[] | undefined) ?? [])
    .filter((s) => s.status !== "ok")
    .map((s) => String(s.source));
  const edition = {
    date,
    slot: opts.slot,
    title: `热点雷达 · ${opts.slot === "morning" ? "早报" : "晚报"}`,
    published_at: new Date().toISOString(),
    items,
    updates: [],
    missing,
    pending_checks: [],
  };
  fs.mkdirSync(editionsDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(edition, null, 2) + "\n", "utf-8");
  const { created, updated } = applyRecord(
    ctx,
    items.map((it) => ({ name: it.title, sources: it.sources, grade: it.level })),
    date,
  );
  return { file, items: items.length, created, updated, model: grading.model };
}
