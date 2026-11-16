// Declarative panel plugins (Plugin-P0; design: PLUGINS.md in the
// architecture notes). A plugin's topic-page panel is DATA — a head
// plus a sequence of structured blocks — never an HTML string and
// never framework code, so the same definition renders here into
// static HTML today and into components after the P2 migration.
//
// Two block families:
//  - template blocks (subh / note / olist / tips) interpolate a value
//    context the publisher computes per topic (name, heat, hook, …);
//  - data blocks (fields) read the grading agent's structured output
//    from the edition item's `plugins.<id>` namespace. A plugin with
//    requiresData renders NOTHING for items without that namespace —
//    no template-assembled fake advice, ever (design red line).

import { esc } from "./py.js";

export interface LocalizedText {
  zh?: string;
  en?: string;
  ja?: string;
  [lang: string]: string | undefined;
}

export interface PanelListItem {
  label: LocalizedText;
  format: LocalizedText;
  /** Skip the item when the named context value is empty. */
  when?: string;
}

export interface PanelFieldItem {
  label: LocalizedText;
  field: string;
}

export type PanelBlock =
  | { type: "subh"; text: LocalizedText }
  | { type: "note"; text: LocalizedText; margin?: number }
  | { type: "olist"; items: PanelListItem[] }
  | { type: "tips"; lists: Record<string, string[]> }
  | { type: "fields"; items: PanelFieldItem[] }
  | { type: "disclaimer"; text: LocalizedText };

export interface PanelPluginDef {
  id: string;
  order: number;
  /** True when the panel needs per-item grading output to exist. */
  requiresData: boolean;
  head: { title: LocalizedText; right?: LocalizedText };
  blocks: PanelBlock[];
  /** Mandatory notice rendered at the panel's end; not user-removable. */
  disclaimer?: LocalizedText;
}

/** A value the publisher offers to template blocks. `raw` values are
 *  already-HTML (e.g. the escaped body with <br>); everything else is
 *  escaped on interpolation. */
export interface PanelValue {
  text: string;
  raw?: boolean;
}

export function pickText(t: LocalizedText | undefined, lang: string): string {
  if (!t) return "";
  return t[lang] ?? t.en ?? t.zh ?? "";
}

function interpolate(tpl: string, values: Record<string, PanelValue>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = values[k];
    if (!v) return "";
    return v.raw ? v.text : esc(v.text);
  });
}

function fieldText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => fieldText(x)).filter((x) => x !== null);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (typeof v === "object") return null; // structured values need a format; P0 stays flat
  return String(v);
}

export function renderPanel(
  def: PanelPluginDef,
  lang: string,
  values: Record<string, PanelValue>,
  data: Record<string, unknown> | undefined,
): string {
  if (def.requiresData && !data) return "";
  // Panel-definition strings are trusted author content (the legacy
  // literals were inserted raw too); only interpolated values and
  // agent-produced field data are escaped.
  let out =
    `<section class="panel"><div class="panel-h"><span>${pickText(def.head.title, lang)}</span>`;
  if (def.head.right) out += `<span class="r">${pickText(def.head.right, lang)}</span>`;
  out += "</div>";
  for (const b of def.blocks) {
    if (b.type === "subh") {
      out += `<div class="subh">${pickText(b.text, lang)}</div>`;
    } else if (b.type === "note") {
      out += `<div class="note" style="margin-top:${b.margin ?? 8}px">${pickText(b.text, lang)}</div>`;
    } else if (b.type === "olist") {
      const items = b.items.filter(
        (it) => !it.when || (values[it.when]?.text ?? "") !== "",
      );
      out +=
        '<ol class="ol-list">' +
        items
          .map(
            (it) =>
              `<li><b>${pickText(it.label, lang)}</b>：${interpolate(pickText(it.format, lang), values)}</li>`,
          )
          .join("") +
        "</ol>";
    } else if (b.type === "tips") {
      const list = b.lists[lang] ?? b.lists.en ?? b.lists.zh ?? [];
      out +=
        '<ul class="tips">' +
        list.map((x) => `<li>${esc(x)}</li>`).join("") +
        "</ul>";
    } else if (b.type === "fields") {
      const rows: string[] = [];
      for (const it of b.items) {
        const v = data ? fieldText(data[it.field]) : null;
        if (v === null) continue;
        rows.push(`<li><b>${pickText(it.label, lang)}</b>：${esc(v)}</li>`);
      }
      if (rows.length > 0) out += '<ol class="ol-list">' + rows.join("") + "</ol>";
    } else if (b.type === "disclaimer") {
      out += `<div class="note" style="margin-top:10px">${pickText(b.text, lang)}</div>`;
    }
  }
  if (def.disclaimer) {
    out += `<div class="note" style="margin-top:10px">${pickText(def.disclaimer, lang)}</div>`;
  }
  out += "</section>";
  return out;
}
