import type { Lang, SiteData, TopicApp } from "../lib/data";

/** Plugin-P1 sub-score chips: one pill per enabled score plugin
 *  with a stored score on this appearance — the JSX twin of the
 *  publisher's scoreChips. The heat stays the primary number. */
export function ScoreChips({
  data,
  app,
  lang,
}: {
  data: SiteData;
  app: TopicApp;
  lang: Lang;
}) {
  const plugins = (app as { plugins?: Record<string, Record<string, unknown>> }).plugins;
  if (!plugins || data.scorePlugins.length === 0) return null;
  const chips: { id: string; label: string; value: number }[] = [];
  for (const desc of data.scorePlugins) {
    const value = plugins[desc.id]?.score;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    chips.push({ id: desc.id, label: desc.label[lang] ?? desc.label.zh, value });
  }
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((c) => (
        <span key={c.id} className="pscore" title={c.label}>
          {c.label} {c.value}
        </span>
      ))}
    </>
  );
}
