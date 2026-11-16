import Link from "next/link";
import { notFound } from "next/navigation";

import { Footer } from "../../../components/Footer";
import { Mast } from "../../../components/Mast";
import { getSiteData, isLang, slotLabel, type Lang } from "../../../lib/data";
import { fmt, s } from "../../../lib/strings";

export default async function ArchivePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const byDate = new Map<string, typeof data.editions>();
  for (const ed of data.editions) {
    const arr = byDate.get(ed.date);
    if (arr) arr.push(ed);
    else byDate.set(ed.date, [ed]);
  }
  const dates = [...byDate.keys()].sort().reverse();
  return (
    <div className="wrap">
      <Mast lang={l} active="archive" path="archive" />
      <section className="panel">
        <div className="panel-h">
          <span>{s(l, "archive_title")}</span>
          <span className="r">{fmt(s(l, "archive_r"), { n: data.editions.length })}</span>
        </div>
        {dates.map((date) => {
          const eds = [...(byDate.get(date) ?? [])].sort((a, b) =>
            (b.published_at ?? "") < (a.published_at ?? "")
              ? -1
              : (b.published_at ?? "") > (a.published_at ?? "")
                ? 1
                : 0,
          );
          return (
            <div key={date}>
              <div className="panel-h" style={{ marginTop: 16 }}>
                <span>{date}</span>
                <span className="r">{fmt(s(l, "editions_n"), { n: eds.length })}</span>
              </div>
              {eds.map((ed) => {
                let top = ed.items[0];
                for (const it of ed.items) {
                  if ((it._heat ?? 0) > (top?._heat ?? 0)) top = it;
                }
                const tim = (ed.published_at ?? "").slice(11, 16);
                const title =
                  (l !== "zh" ? ed.i18n?.[l]?.title : undefined) || ed.title || "";
                const topTitle = top
                  ? [...((l !== "zh" ? top.i18n?.[l]?.title : undefined) || top.title || "")]
                      .slice(0, 30)
                      .join("")
                  : "";
                const id = `${ed.date}-${ed.slot ?? "None"}`;
                return (
                  <div className="row" key={id}>
                    <span className="time">{tim}</span>
                    <span className="rtitle">
                      <Link href={`/${l}/edition/${id}`}>
                        {slotLabel(ed, l)} · {title}
                      </Link>
                    </span>
                    <span className="note">
                      {fmt(s(l, "archive_row"), { n: ed.items.length })}
                      {topTitle}
                    </span>
                    <span className="heat">
                      <span className="hv">
                        <b>{top?._heat ?? 0}</b> <span>{s(l, "wave")}</span>
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>
      <Footer lang={l} />
    </div>
  );
}
