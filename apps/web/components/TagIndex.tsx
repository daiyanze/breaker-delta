import Link from "next/link";

import { catRulesFromConfig, DEFAULT_CAT_RULE_SET } from "@breaker-delta/core";
import { LEVELS } from "@breaker-delta/publisher";

import type { Lang, SiteData } from "../lib/data";
import { catKey, catNameOf, latestBoard, levelLabelOf } from "../lib/data";
import { s } from "../lib/strings";

/** Category + level chip index (tagIndex in build.ts): categories
 * in rule order (instance rules, else the built-in set), then the
 * three levels; chips carry their topic counts on the latest board. */
export function TagIndex({
  data,
  lang,
  active,
}: {
  data: SiteData;
  lang: Lang;
  active?: string;
}) {
  const board = latestBoard(data);
  const rules = catRulesFromConfig(data.config) ?? DEFAULT_CAT_RULE_SET;
  const catOrder = [...rules.rules.map(([c]) => c), rules.fallback];
  const chips: React.ReactNode[] = [];
  for (const cat of catOrder) {
    const n = board.filter((st) => st.app.category === cat).length;
    if (n === 0) continue;
    chips.push(
      <Link
        key={`cat:${cat}`}
        className={`tagchip${active === `cat:${cat}` ? " on" : ""}`}
        href={`/${lang}/category/${catKey(cat)}`}
      >
        {catNameOf(data, cat, lang)} · {n}
      </Link>,
    );
  }
  for (const lv of ["must", "watch", "echo"]) {
    const n = board.filter((st) => st.app.level === lv).length;
    if (n === 0) continue;
    chips.push(
      <Link
        key={`lv:${lv}`}
        className={`tagchip${active === `lv:${lv}` ? " on" : ""}`}
        href={`/${lang}/level/${lv}`}
      >
        {LEVELS[lv][0]}
        {levelLabelOf(lv, lang)} · {n}
      </Link>,
    );
  }
  return (
    <section className="panel">
      <div className="panel-h">
        <span>{s(lang, "tags_title")}</span>
      </div>
      <div className="tagchips">{chips}</div>
    </section>
  );
}
