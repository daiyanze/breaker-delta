import { notFound } from "next/navigation";

import { parseTrackRecord } from "@breaker-delta/core";

import { Footer } from "../../../components/Footer";
import { Mast } from "../../../components/Mast";
import { getSiteData, isLang, levelLabelOf, type Lang } from "../../../lib/data";
import { fmt, s, sArr } from "../../../lib/strings";

export default async function TrackRecordPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const tr = parseTrackRecord(data.trackRecord ?? "");
  const summary = tr.reviewed
    ? `${s(l, "tr_reviewed")} ${tr.reviewed} · ${s(l, "tr_hit_rate")} ${Math.round((tr.hits / tr.reviewed) * 100)}%`
    : fmt(s(l, "tr_first_review"), { d: tr.first_review });
  const ths = sArr(l, "tr_th");
  return (
    <div className="wrap">
      <Mast lang={l} active="track" path="track-record" />
      <section className="panel">
        <div className="panel-h">
          <span>{s(l, "tr_title")}</span>
          <span className="r">
            {s(l, "tr_total")} {tr.total} · {s(l, "tr_reviewed")} {tr.reviewed}
          </span>
        </div>
        <div className="detail">
          <p>{s(l, "tr_intro")}</p>
          <p>
            <b>{summary}</b>
          </p>
          <h3 style={{ margin: "16px 0 6px" }}>{s(l, "tr_criteria_t")}</h3>
          <div dangerouslySetInnerHTML={{ __html: s(l, "tr_criteria") }} />
        </div>
      </section>
      {tr.groups.map((g) => (
        <section className="panel" key={`${g.date}:${g.label}`}>
          <div className="panel-h">
            <span>
              {g.date} {g.label}
            </span>
            <span className="r">
              {ths[3]} {g.review_date}
            </span>
          </div>
          <table>
            <tbody>
              <tr>
                {ths.map((x, i) => (
                  <th key={i}>{x}</th>
                ))}
              </tr>
              {g.entries.map((en, i) => (
                <tr className="tr-row" key={i}>
                  <td>
                    {en.emoji} {levelLabelOf(en.level, l)}
                  </td>
                  <td>{en.topic}</td>
                  <td>{en.criteria}</td>
                  <td className="n">{en.review_date}</td>
                  <td>{en.result ? en.result : s(l, "tr_pending")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <Footer lang={l} />
    </div>
  );
}
