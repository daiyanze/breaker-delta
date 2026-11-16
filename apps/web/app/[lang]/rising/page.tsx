import { notFound } from "next/navigation";

import { BoardRow, stateRow } from "../../../components/BoardRow";
import { Footer } from "../../../components/Footer";
import { HeatHelp } from "../../../components/HeatHelp";
import { Mast } from "../../../components/Mast";
import { edLabel, getSiteData, isLang, latestBoard, type Lang } from "../../../lib/data";
import { fmt, s } from "../../../lib/strings";

export default async function RisingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const board = latestBoard(data);
  // Gain vs the previous board state; a topic new at the latest
  // point counts its full heat as the gain (build.ts's effGain).
  const gain = (st: (typeof board)[number]) => st.heatDelta ?? st.app.heat;
  const rising = board.filter((st) => gain(st) > 0).sort((a, b) => gain(b) - gain(a));
  const latest = data.editions[data.editions.length - 1];
  return (
    <div className="wrap">
      <Mast lang={l} active="rising" path="rising" />
      <HeatHelp lang={l} />
      <section className="panel">
        <div className="panel-h">
          <span>{s(l, "rising_title")}</span>
          <span className="r">
            {latest ? edLabel(latest) : ""} · {fmt(s(l, "rising_r"), { n: rising.length })}
          </span>
        </div>
        {rising.length > 0 ? (
          rising.map((st, i) => (
            <BoardRow
              key={st.topic.key}
              row={{ ...stateRow(st), rank: i + 1 }}
              lang={l}
              data={data}
              showLevel
            />
          ))
        ) : (
          <p className="note">{s(l, "rising_empty")}</p>
        )}
      </section>
      <Footer lang={l} />
    </div>
  );
}
