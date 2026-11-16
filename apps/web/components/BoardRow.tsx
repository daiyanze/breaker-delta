import Link from "next/link";

import { LEVELS } from "@breaker-delta/publisher";

import type { BoardState, Lang } from "../lib/data";
import { catKey, locApp } from "../lib/data";
import { s } from "../lib/strings";

function DeltaChips({ st, lang }: { st: BoardState; lang: Lang }) {
  const chips: React.ReactNode[] = [];
  if (st.heatDelta === null) {
    chips.push(
      <span key="new" className="dchip new">
        {s(lang, "new")}
      </span>,
    );
  } else if (st.heatDelta !== 0) {
    chips.push(
      <span key="h" className={`dchip ${st.heatDelta > 0 ? "up" : "down"}`}>
        {st.heatDelta > 0 ? "▲" : "▼"} {Math.abs(st.heatDelta)}
      </span>,
    );
  }
  if (st.rankDelta !== null && st.rankDelta !== 0) {
    chips.push(
      <span key="r" className={`dchip ${st.rankDelta > 0 ? "up" : "down"}`}>
        #{st.rankDelta > 0 ? "+" : ""}
        {st.rankDelta}
      </span>,
    );
  }
  return <span className="deltas">{chips}</span>;
}

/** One board row — same information as the static rowHtml: rank,
 * level badge, localized title, category tag, wave height + deltas,
 * carried mark. */
export function BoardRow({ st, lang }: { st: BoardState; lang: Lang }) {
  const t = st.topic;
  const loc = locApp(st.app, lang);
  const lvl = st.app.level ? LEVELS[st.app.level] : undefined;
  return (
    <div className="row">
      <span className={`rank${st.rank <= 3 ? " top" : ""}`}>{st.rank}</span>
      <span className="rtitle">
        <Link href={`/${lang}/topic/${t.slug}`}>{loc.title}</Link>
        {st.carried ? <span className="prank"> · {s(lang, "carried")}</span> : null}
      </span>
      {lvl ? <span className="badge">{lvl[0]} {lvl[1]}</span> : null}
      <Link className="tag" href={`/${lang}/category/${catKey(st.app.category)}`}>
        {st.app.category}
      </Link>
      <DeltaChips st={st} lang={lang} />
      <span className="heat">
        <span className="hv">
          <b>{st.heat}</b> <span>{s(lang, "wave")}</span>
        </span>
      </span>
    </div>
  );
}
