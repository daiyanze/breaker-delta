import { notFound } from "next/navigation";

import { BoardRow, stateRow } from "../../../../components/BoardRow";
import { Footer } from "../../../../components/Footer";
import { Mast } from "../../../../components/Mast";
import { TagIndex } from "../../../../components/TagIndex";
import {
  catNameOf,
  categoryIndex,
  getSiteData,
  isLang,
  latestBoard,
  type Lang,
} from "../../../../lib/data";
import { fmt, s } from "../../../../lib/strings";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ lang: string; key: string }>;
}) {
  const { lang, key } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const cat = categoryIndex(data).find((c) => c.key === key);
  if (!cat) notFound();
  const rows = latestBoard(data).filter((st) => st.app.category === cat.name);
  return (
    <div className="wrap">
      <Mast lang={l} active="categories" path={`category/${key}`} />
      <TagIndex data={data} lang={l} active={`cat:${cat.name}`} />
      <section className="panel">
        <div className="panel-h">
          <span>{catNameOf(data, cat.name, l)}</span>
          <span className="r">{fmt(s(l, "cat_r"), { n: rows.length })}</span>
        </div>
        {rows.map((st) => (
          <BoardRow key={st.topic.key} row={stateRow(st)} lang={l} data={data} />
        ))}
      </section>
      <Footer lang={l} />
    </div>
  );
}
