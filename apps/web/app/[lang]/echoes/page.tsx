import Link from "next/link";
import { notFound } from "next/navigation";

import { appRow, BoardRow } from "../../../components/BoardRow";
import { Footer } from "../../../components/Footer";
import { Mast } from "../../../components/Mast";
import {
  edLabel,
  getSiteData,
  isLang,
  type Lang,
  type Topic,
  type TopicApp,
} from "../../../lib/data";
import { s } from "../../../lib/strings";

export default async function EchoesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const latestEi = data.editions.length - 1;
  // Latest echoes + echo appearances of the last 3 editions.
  const echoApps: [Topic, TopicApp][] = [];
  for (const t of data.topics) {
    for (const a of t.apps) {
      if (a.level === "echo" && a.edition >= latestEi - 2) echoApps.push([t, a]);
    }
  }
  echoApps.sort((x, y) => y[1].edition - x[1].edition || y[1].heat - x[1].heat);
  return (
    <div className="wrap">
      <Mast lang={l} active="echoes" path="echoes" />
      <section className="panel">
        <div className="detail">
          <Link href={`/${l}/submit`}>{s(l, "sub_cta")}</Link>
        </div>
      </section>
      <section className="panel">
        <div className="panel-h">
          <span>{s(l, "seeds_title")}</span>
          <span className="r">{s(l, "seeds_r")}</span>
        </div>
        {echoApps.map(([t, a], i) => (
          <BoardRow
            key={`${t.key}:${a.edition}:${i}`}
            row={appRow(t, a, i + 1)}
            lang={l}
            data={data}
            extraNote={edLabel(data.editions[a.edition])}
          />
        ))}
      </section>
      <Footer lang={l} />
    </div>
  );
}
