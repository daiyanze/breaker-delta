import Link from "next/link";
import { notFound } from "next/navigation";

import { BoardRow, stateRow } from "../../components/BoardRow";
import { Footer } from "../../components/Footer";
import { HeatHelp } from "../../components/HeatHelp";
import { Mast } from "../../components/Mast";
import { Slider } from "../../components/Slider";
import { edLabel, getSiteData, isLang, type Lang } from "../../lib/data";
import { fmt, s } from "../../lib/strings";

const PER = 100;
/** The slider window: the most recent 60 board states. */
const WINDOW = 60;

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const { e } = await searchParams;
  const latestEi = data.states.length - 1;
  let ei = latestEi;
  if (e !== undefined) {
    const n = Number(e);
    if (Number.isInteger(n) && n >= 0 && n <= latestEi) ei = n;
  }
  const winStart = Math.max(0, data.editions.length - WINDOW);
  const winEditions = data.editions.slice(winStart);
  const states = data.states[ei];
  const rows = states ? [...states.values()].sort((x, y) => x.rank - y.rank) : [];
  const ed = data.editions[ei];
  return (
    <div className="wrap">
      <Mast lang={l} active="index" />
      <Slider
        lang={l}
        labels={winEditions.map((x) => edLabel(x))}
        baseIndex={winStart}
        current={ei}
        caption={s(l, "slider")}
        currentLabel={`${ed ? edLabel(ed) : ""} · ${ei === latestEi ? s(l, "current") : s(l, "hist")}`}
      />
      {/* Every window state is also a plain link (the static mast's
          timeline): no-JS time travel, one URL per state. */}
      <div className="ticks-scroll">
        <div className="timeline tight">
          {winEditions.map((edition, i) => {
            const gi = winStart + i;
            return (
              <span key={gi} className={`tick${gi === ei ? " on" : ""}`}>
                <Link href={`/${l}?e=${gi}`}>{edition.date}</Link>
              </span>
            );
          })}
        </div>
      </div>
      <section className="panel">
        <div className="panel-h">
          <span>{s(l, "board_title")}</span>
          <span className="r">{fmt(s(l, "count"), { n: rows.length })}</span>
        </div>
        {rows.slice(0, PER).map((st) => (
          <BoardRow key={st.topic.key} row={stateRow(st)} lang={l} data={data} />
        ))}
      </section>
      <HeatHelp lang={l} />
      <Footer lang={l} />
    </div>
  );
}
