import { notFound } from "next/navigation";

import { BoardRow } from "../../../../components/BoardRow";
import { Mast } from "../../../../components/Mast";
import {
  categoryIndex,
  getSiteData,
  isLang,
  latestBoard,
  type Lang,
} from "../../../../lib/data";

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
      <Mast lang={l} active="categories" />
      <h1 className="pg-title">{cat.name}</h1>
      <section className="panel">
        {rows.map((st) => (
          <BoardRow key={st.topic.key} st={st} lang={l} />
        ))}
      </section>
    </div>
  );
}
