// The structured-block panel renderer as React components — the JSX
// twin of publisher's renderPanel (Plugin-P0 design: a panel definition
// is data, so the same panel.yaml renders into static HTML there and
// into components here). Semantics kept identical: a requiresData
// plugin renders nothing without per-item data; definition text is
// trusted author content; interpolated values are escaped unless the
// value is marked raw (already-HTML, e.g. body / dataLine); field
// values from grading output are always plain text.

import type { ReactNode } from "react";

import {
  pickText,
  type PanelBlock,
  type PanelPluginDef,
  type PanelValue,
} from "@breaker-delta/publisher";

import type { Lang } from "../lib/data";

function fieldText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => fieldText(x)).filter((x) => x !== null);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (typeof v === "object") return null;
  return String(v);
}

/** Interpolate {key} placeholders. Raw values are already-HTML and go
 * through dangerouslySetInnerHTML; everything else is plain text
 * (React escapes it). A literal <br> in the template is honoured, as
 * in the static renderer's raw definition text. */
function Interp({ tpl, values }: { tpl: string; values: Record<string, PanelValue> }): ReactNode {
  const chunks = tpl.split(/(<br>|\{\w+\})/g);
  return chunks.map((c, i) => {
    if (c === "<br>") return <br key={i} />;
    const m = /^\{(\w+)\}$/.exec(c);
    if (!m) return <span key={i}>{c}</span>;
    const v = values[m[1]];
    if (!v) return null;
    if (v.raw) {
      return <span key={i} dangerouslySetInnerHTML={{ __html: v.text }} />;
    }
    return <span key={i}>{v.text}</span>;
  });
}

function Block({
  block,
  lang,
  values,
  data,
}: {
  block: PanelBlock;
  lang: Lang;
  values: Record<string, PanelValue>;
  data: Record<string, unknown> | undefined;
}): ReactNode {
  switch (block.type) {
    case "subh":
      return <div className="subh">{pickText(block.text, lang)}</div>;
    case "note":
      return (
        <div className="note" style={{ marginTop: block.margin ?? 8 }}>
          {pickText(block.text, lang)}
        </div>
      );
    case "olist": {
      const items = block.items.filter(
        (it) => !it.when || (values[it.when]?.text ?? "") !== "",
      );
      return (
        <ol className="ol-list">
          {items.map((it, i) => (
            <li key={i}>
              <b>{pickText(it.label, lang)}</b>：
              <Interp tpl={pickText(it.format, lang)} values={values} />
            </li>
          ))}
        </ol>
      );
    }
    case "tips": {
      const list = block.lists[lang] ?? block.lists.en ?? block.lists.zh ?? [];
      return (
        <ul className="tips">
          {list.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      );
    }
    case "fields": {
      const rows = block.items
        .map((it) => ({ label: pickText(it.label, lang), v: data ? fieldText(data[it.field]) : null }))
        .filter((r) => r.v !== null);
      if (rows.length === 0) return null;
      return (
        <ol className="ol-list">
          {rows.map((r, i) => (
            <li key={i}>
              <b>{r.label}</b>：{r.v}
            </li>
          ))}
        </ol>
      );
    }
    case "disclaimer":
      return (
        <div className="note" style={{ marginTop: 10 }}>
          {pickText(block.text, lang)}
        </div>
      );
  }
}

export function Panel({
  def,
  lang,
  values,
  data,
}: {
  def: PanelPluginDef;
  lang: Lang;
  values: Record<string, PanelValue>;
  data: Record<string, unknown> | undefined;
}): ReactNode {
  if (def.requiresData && !data) return null;
  return (
    <section className="panel">
      <div className="panel-h">
        <span>{pickText(def.head.title, lang)}</span>
        {def.head.right ? <span className="r">{pickText(def.head.right, lang)}</span> : null}
      </div>
      {def.blocks.map((b, i) => (
        <Block key={i} block={b} lang={lang} values={values} data={data} />
      ))}
      {def.disclaimer ? (
        <div className="note" style={{ marginTop: 10 }}>
          {pickText(def.disclaimer, lang)}
        </div>
      ) : null}
    </section>
  );
}
