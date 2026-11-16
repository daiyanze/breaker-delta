import Link from "next/link";
import { notFound } from "next/navigation";

import type { PanelValue } from "@breaker-delta/publisher";

import { Footer } from "../../../../components/Footer";
import { Mast } from "../../../../components/Mast";
import { Panel } from "../../../../components/Panel";
import { ScoreChips } from "../../../../components/ScoreChips";
import { WaveChart } from "../../../../components/WaveChart";
import type { Topic, TopicApp } from "@breaker-delta/core";

import {
  catKey,
  catNameOf,
  getSiteData,
  isLang,
  locApp,
  locTopicName,
  type Lang,
} from "../../../../lib/data";
import { fmt, s } from "../../../../lib/strings";

function esc(x: string): string {
  return x
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function firstSentence(text: string): string {
  const m = /^[\s\S]*?[。.!?！？]/.exec(text);
  return m ? m[0] : text;
}

function cpSlice(x: string, a: number, b: number): string {
  return [...x].slice(a, b).join("");
}

function boardRank(a: TopicApp): number {
  return (a as TopicApp & { board_rank?: number }).board_rank ?? a.rank;
}

/** Panel value context — the same values build.ts computes for the
 * static renderer (name / heat / rank / n / hook / action / body /
 * dataLine / sourcesLine / traj / firstTitle / lastTitle). */
function panelValues(t: Topic, lang: Lang): Record<string, PanelValue> {
  const last = t.apps[t.apps.length - 1];
  const locLast = locApp(last, lang);
  const locName = locTopicName(t, lang);
  const bodyHtml = esc(locLast.body).replaceAll("\n", "<br>");
  const hook = cpSlice(firstSentence((locLast.body || "").trim()), 0, 90);
  const allSrcs = [...new Set(t.apps.flatMap((a) => a.sources))].sort();
  const doms: string[] = [];
  for (const a of t.apps) {
    for (const u of a.links) {
      try {
        const d = new URL(u).hostname;
        if (d && !doms.includes(d)) doms.push(d);
      } catch {
        /* unparseable link: skipped, as urlNetloc does */
      }
    }
  }
  const srcLine = doms.length > 0 ? doms.join(" · ") : "—";
  const dataLine =
    fmt(s(lang, "wave_rank"), { h: last.heat, r: boardRank(last) }) +
    " · " +
    fmt(s(lang, "resonance"), { n: allSrcs.length });
  return {
    name: { text: locName },
    heat: { text: String(last.heat) },
    rank: { text: String(boardRank(last)) },
    n: { text: String(allSrcs.length) },
    hook: { text: hook },
    action: { text: locLast.action ?? "" },
    body: { text: bodyHtml, raw: true },
    dataLine: { text: dataLine, raw: true },
    sourcesLine: { text: srcLine },
    traj: { text: t.apps.map((a) => a.heat).join(" → ") },
    firstTitle: { text: locApp(t.apps[0], lang).title },
    lastTitle: { text: locLast.title },
  };
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  // Slugs carry raw CJK (title-slug scheme); depending on the client
  // and runtime the route param may arrive percent-encoded.
  let t = data.bySlug.get(slug);
  if (!t) {
    try {
      t = data.bySlug.get(decodeURIComponent(slug));
    } catch {
      /* malformed encoding: fall through to 404 */
    }
  }
  if (!t) notFound();
  const last = t.apps[t.apps.length - 1];
  const locLast = locApp(last, l);
  const values = panelValues(t, l);
  const ths = ["date", "heat", "rank", "title"];
  return (
    <div className="wrap">
      <Mast lang={l} active="" path={`topic/${t.slug}`} />
      <section className="panel">
        <div className="panel-h">
          <span>{locTopicName(t, l)}</span>
          <Link className="tag" href={`/${l}/category/${catKey(last.category)}`}>
            {catNameOf(data, last.category, l)}
          </Link>
        </div>
        <div className="big-heat">{last.heat}</div>
        <ScoreChips data={data} app={last} lang={l} />
        <div className="detail">
          {locLast.body.split("\n").map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {locLast.action ? (
            <p>
              <b>{s(l, "action")}</b>：{locLast.action}
            </p>
          ) : null}
        </div>
        {last.links.length > 0 ? (
          <div className="orig">
            <div className="note">
              {s(l, "orig_links")} ({last.links.length})
            </div>
            <ul>
              {last.links.map((u, i) => (
                <li key={i}>
                  <a href={u} rel="nofollow noopener">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <h3 style={{ margin: "26px 0 6px" }}>{s(l, "chart")}</h3>
        <WaveChart topic={t} editionCount={data.editions.length} lang={l} />
        <table>
          <thead>
            <tr>
              <th>{ths[0]}</th>
              <th className="n">{ths[1]}</th>
              <th className="n">{ths[2]}</th>
              <th>{ths[3]}</th>
            </tr>
          </thead>
          <tbody>
            {[...t.apps].reverse().map((a, i) => (
              <tr key={i}>
                <td>
                  {a.date}
                  {a.slot ? ` ${a.slot}` : ""}
                </td>
                <td className="n">{a.heat}</td>
                <td className="n">{boardRank(a)}</td>
                <td>{locApp(a, l).title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {data.panelDefs.map((def) => (
        <Panel
          key={def.id}
          def={def}
          lang={l}
          values={values}
          data={last.plugins?.[def.id]}
        />
      ))}
      <Footer lang={l} />
    </div>
  );
}
