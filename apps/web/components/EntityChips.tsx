import type { Lang, SiteData, TopicApp } from "../lib/data";

/** Plugin-P2 entity chips: the entity names stored by enabled
 *  extraction plugins on this appearance — the JSX twin of the
 *  publisher's entityChips. */
export function EntityChips({
  data,
  app,
}: {
  data: SiteData;
  app: TopicApp;
  lang: Lang;
}) {
  const plugins = (app as { plugins?: Record<string, Record<string, unknown>> }).plugins;
  if (!plugins || data.entityPlugins.length === 0) return null;
  const names: { key: string; name: string; plugin: string }[] = [];
  for (const id of data.entityPlugins) {
    const entities = plugins[id]?.entities;
    if (!Array.isArray(entities)) continue;
    for (const e of entities as { name?: unknown }[]) {
      if (typeof e?.name === "string" && e.name !== "") {
        names.push({ key: `${id}:${e.name}`, name: e.name, plugin: id });
      }
    }
  }
  if (names.length === 0) return null;
  return (
    <>
      {names.map((n) => (
        <span key={n.key} className="pscore" title={n.plugin}>
          {n.name}
        </span>
      ))}
    </>
  );
}
