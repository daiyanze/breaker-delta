import Link from "next/link";
import { notFound } from "next/navigation";

import { BoardRow } from "../../components/BoardRow";
import { Mast } from "../../components/Mast";
import { getSiteData, isLang, type Lang } from "../../lib/data";
import { s, fmt } from "../../lib/strings";

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
  const states = data.states[ei];
  const rows = states ? [...states.values()].sort((x, y) => x.rank - y.rank) : [];
  const ed = data.editions[ei];
  return (
    <div className="wrap">
      <Mast lang={l} active="" />
      <h1 className="pg-title">{s(l, "pg_title")}</h1>
      <div className="note">
        {ed ? `${ed.date}${ed.slot ? ` · ${ed.slot}` : ""}` : ""} ·{" "}
        {fmt(s(l, "editions_n"), { n: data.editions.length })}
        {ei !== latestEi ? (
          <>
            {" · "}
            <Link href={`/${l}`}>← latest</Link>
          </>
        ) : null}
      </div>
      {/* Time travel: the dynamic board renders any past edition's
          state directly — the static site needs its slider script and
          embedded JSON for this. */}
      <div className="ticks-scroll">
        <div className="timeline tight">
          {data.editions.map((edition, i) => (
            <span key={i} className={`tick${i === ei ? " on" : ""}`}>
              <Link href={`/${l}?e=${i}`}>{edition.date}</Link>
            </span>
          ))}
        </div>
      </div>
      <section className="panel">
        {rows.slice(0, 100).map((st) => (
          <BoardRow key={st.topic.key} st={st} lang={l} />
        ))}
      </section>
    </div>
  );
}
