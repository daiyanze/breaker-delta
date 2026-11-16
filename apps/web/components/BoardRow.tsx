import Link from "next/link";

import { LEVELS } from "@breaker-delta/publisher";

import type { Lang, SiteData, Topic, TopicApp } from "../lib/data";
import { catKey, catNameOf, levelLabelOf, locApp, trendPoints, tstamp } from "../lib/data";
import { s } from "../lib/strings";
import { AvatarStack } from "./AvatarStack";
import { Spark } from "./Spark";

export interface RowSpec {
  topic: Topic;
  app: TopicApp;
  rank: number;
  heatDelta: number | null;
  rankDelta: number | null;
  carried: boolean;
}

function DeltaChip({
  v,
  lang,
  zero,
}: {
  v: number | null;
  lang: Lang;
  zero: string;
}) {
  if (v === null) return <span className="hdelta new">{s(lang, "new")}</span>;
  if (v > 0) return <span className="hdelta up">▲{v}</span>;
  if (v < 0) return <span className="hdelta down">▼{-v}</span>;
  return <span className="hdelta">{zero}</span>;
}

/** One board row — the JSX twin of publisher's rowHtml: rank block
 * with rank delta + previous rank, localized title, level badge,
 * carried mark, category tag, timestamp, source avatars, sparkline,
 * wave height with heat delta. */
export function BoardRow({
  row,
  lang,
  data,
  showLevel = false,
  extraNote,
}: {
  row: RowSpec;
  lang: Lang;
  data: SiteData;
  showLevel?: boolean;
  /** Extra note rendered just before the heat block (the echoes
   * page stamps each row with its edition label). */
  extraNote?: string;
}) {
  const { topic, app, rank } = row;
  const loc = locApp(app, lang);
  const lvl = app.level != null && LEVELS[app.level] ? LEVELS[app.level] : LEVELS["echo"];
  return (
    <div className="row">
      <span className={`rank${rank <= 3 ? " top" : ""}`}>
        {rank}
        <DeltaChip v={row.rankDelta} lang={lang} zero="→" />
        {row.rankDelta !== null ? (
          <span className="prank">
            {s(lang, "prev")} {rank + row.rankDelta}
          </span>
        ) : null}
      </span>
      <span className="rtitle">
        <Link href={`/${lang}/topic/${topic.slug}`}>{loc.title}</Link>
        {showLevel ? (
          <>
            {" "}
            <Link className="badge" href={`/${lang}/level/${app.level ?? "echo"}`}>
              {lvl[0]}
              {levelLabelOf(app.level, lang)}
            </Link>
          </>
        ) : null}
        {row.carried ? <span className="note"> {s(lang, "carried")}</span> : null}
      </span>
      {app.category ? (
        <Link className="tag" href={`/${lang}/category/${catKey(app.category)}`}>
          {catNameOf(data, app.category, lang)}
        </Link>
      ) : null}
      <span className="time">{tstamp(app)}</span>
      <AvatarStack sources={app.sources} lang={lang} />
      {extraNote ? <span className="note">{extraNote}</span> : null}
      <span className="heat">
        <span className="spark">
          <Spark points={trendPoints(topic, app)} />
        </span>
        <span className="hv">
          <b>{app.heat}</b> <span>{s(lang, "wave")}</span>{" "}
          <DeltaChip v={row.heatDelta} lang={lang} zero="→0" />
        </span>
      </span>
    </div>
  );
}

/** Adapt a board state to a row spec (state deltas win, as in
 * build.ts's spread copies). */
export function stateRow(st: {
  topic: Topic;
  app: TopicApp;
  heatDelta: number | null;
  rankDelta: number | null;
  carried: boolean;
  rank: number;
}): RowSpec {
  return {
    topic: st.topic,
    app: st.app,
    rank: st.rank,
    heatDelta: st.heatDelta,
    rankDelta: st.rankDelta,
    carried: st.carried,
  };
}

/** Adapt a bare appearance (echoes page: per-appearance deltas). */
export function appRow(topic: Topic, app: TopicApp, rank: number): RowSpec {
  return {
    topic,
    app,
    rank,
    heatDelta: app.heat_delta,
    rankDelta: app.rank_delta,
    carried: false,
  };
}
