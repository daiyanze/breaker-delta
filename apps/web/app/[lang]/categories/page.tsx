import Link from "next/link";
import { notFound } from "next/navigation";

import { catRulesFromConfig, DEFAULT_CAT_RULE_SET } from "@breaker-delta/core";

import { BoardRow, stateRow } from "../../../components/BoardRow";
import { Footer } from "../../../components/Footer";
import { Mast } from "../../../components/Mast";
import { TagIndex } from "../../../components/TagIndex";
import {
  catKey,
  catNameOf,
  getSiteData,
  isLang,
  latestBoard,
  type Lang,
} from "../../../lib/data";
import { fmt, s } from "../../../lib/strings";

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const board = latestBoard(data);
  const rules = catRulesFromConfig(data.config) ?? DEFAULT_CAT_RULE_SET;
  const catOrder = [...rules.rules.map(([c]) => c), rules.fallback];
  return (
    <div className="wrap">
      <Mast lang={l} active="categories" path="categories" />
      <TagIndex data={data} lang={l} />
      {catOrder.map((cat) => {
        const sts = board.filter((st) => st.app.category === cat);
        if (sts.length === 0) return null;
        return (
          <section className="panel" key={cat}>
            <div className="panel-h">
              <span>
                <Link href={`/${l}/category/${catKey(cat)}`}>
                  {catNameOf(data, cat, l)}
                </Link>
              </span>
              <span className="r">{fmt(s(l, "cat_r"), { n: sts.length })}</span>
            </div>
            {sts.map((st) => (
              <BoardRow key={st.topic.key} row={stateRow(st)} lang={l} data={data} />
            ))}
          </section>
        );
      })}
      <Footer lang={l} />
    </div>
  );
}
