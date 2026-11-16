import { notFound } from "next/navigation";

import { appRow, BoardRow } from "../../../../components/BoardRow";
import { Footer } from "../../../../components/Footer";
import { Mast } from "../../../../components/Mast";
import {
  edLabel,
  getSiteData,
  isLang,
  type Lang,
  type Topic,
  type TopicApp,
} from "../../../../lib/data";
import { fmt, s } from "../../../../lib/strings";

export default async function EditionPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const ei = data.editions.findIndex(
    (ed) => `${ed.date}-${ed.slot ?? "None"}` === decodeURIComponent(id),
  );
  if (ei < 0) notFound();
  const ed = data.editions[ei];
  // The edition's own snapshot: its items in heat order, each row
  // rendered from the (topic, appearance) pair — like build.ts's
  // tmap lookup keyed by edition + item title.
  const pairByTitle = new Map<string, [Topic, TopicApp]>();
  for (const t of data.topics) {
    for (const a of t.apps) {
      if (a.edition === ei) pairByTitle.set(a.title, [t, a]);
    }
  }
  const items = [...ed.items].sort((x, y) => (y._heat ?? 0) - (x._heat ?? 0));
  return (
    <div className="wrap">
      <Mast lang={l} active="" path={`edition/${id}`} />
      <section className="panel">
        <div className="panel-h">
          <span>{fmt(s(l, "snap_title"), { x: edLabel(ed) })}</span>
          <span className="r">{fmt(s(l, "count"), { n: items.length })}</span>
        </div>
        {items.map((it, i) => {
          const pair = pairByTitle.get(it.title ?? "");
          if (!pair) return null;
          const [t, a] = pair;
          return (
            <BoardRow
              key={`${t.key}:${i}`}
              row={appRow(t, a, i + 1)}
              lang={l}
              data={data}
              showLevel
            />
          );
        })}
      </section>
      <Footer lang={l} />
    </div>
  );
}
