import { notFound } from "next/navigation";

import { LEVELS } from "@breaker-delta/publisher";

import { BoardRow, stateRow } from "../../../../components/BoardRow";
import { Footer } from "../../../../components/Footer";
import { Mast } from "../../../../components/Mast";
import { TagIndex } from "../../../../components/TagIndex";
import {
  getSiteData,
  isLang,
  latestBoard,
  levelLabelOf,
  type Lang,
} from "../../../../lib/data";
import { fmt, s } from "../../../../lib/strings";

const LEVELS_OK = ["must", "watch", "echo"];

export default async function LevelPage({
  params,
}: {
  params: Promise<{ lang: string; lv: string }>;
}) {
  const { lang, lv } = await params;
  if (!isLang(lang) || !LEVELS_OK.includes(lv)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const sts = latestBoard(data).filter((st) => st.app.level === lv);
  if (sts.length === 0) notFound();
  const title = `${LEVELS[lv][0]} ${levelLabelOf(lv, l)}`;
  return (
    <div className="wrap">
      <Mast lang={l} active="categories" path={`level/${lv}`} />
      <TagIndex data={data} lang={l} active={`lv:${lv}`} />
      <section className="panel">
        <div className="panel-h">
          <span>{title}</span>
          <span className="r">{fmt(s(l, "cat_r"), { n: sts.length })}</span>
        </div>
        {sts.map((st) => (
          <BoardRow key={st.topic.key} row={stateRow(st)} lang={l} data={data} />
        ))}
      </section>
      <Footer lang={l} />
    </div>
  );
}
