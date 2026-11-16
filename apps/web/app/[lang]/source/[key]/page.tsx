import Link from "next/link";
import { notFound } from "next/navigation";

import { sourceBlock, SOURCE_DOMAINS, yamlSourceBlocks } from "@breaker-delta/publisher";

import { Footer } from "../../../../components/Footer";
import { Mast } from "../../../../components/Mast";
import {
  catKey,
  catNameOf,
  edLabel,
  getSiteData,
  isLang,
  locTopicName,
  sourceIndex,
  srcNameOf,
  srcStatsText,
  type Lang,
} from "../../../../lib/data";
import { fmt, s } from "../../../../lib/strings";

function sumOrd(x: string): number {
  let n = 0;
  for (const ch of x) n += ch.codePointAt(0) ?? 0;
  return n;
}

function firstAlnum(x: string): string {
  for (const ch of x) if (/[A-Za-z0-9]/.test(ch)) return ch;
  return [...x][0] ?? "";
}

export default async function SourcePage({
  params,
}: {
  params: Promise<{ lang: string; key: string }>;
}) {
  const { lang, key } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const idx = sourceIndex(data);
  const src = idx.byBase.get(key) ?? idx.byBase.get(decodeURIComponent(key));
  if (!src) notFound();
  const e = idx.stats.get(src);
  if (!e) notFound();
  const dom = SOURCE_DOMAINS[src];
  const hue = sumOrd(src) % 360;
  const tops = [...e.topics.values()].sort(
    (x, y) => y.apps[y.apps.length - 1].heat - x.apps[x.apps.length - 1].heat,
  );
  const blocks = data.configText ? yamlSourceBlocks(data.configText) : new Map<string, string>();
  const blk = sourceBlock(src, blocks);
  return (
    <div className="wrap">
      <Mast lang={l} active="sources" path={`source/${key}`} />
      <section className="panel">
        <div className="panel-h">
          <span>
            <span
              className="av src-ic"
              style={{ background: `hsl(${hue} 65% 72%)`, marginLeft: 0 }}
            >
              {firstAlnum(srcNameOf(src, l))}
            </span>{" "}
            {srcNameOf(src, l)}
          </span>
          {dom ? (
            <span>
              <a href={`https://${dom}`} rel="noopener">
                {dom} ↗
              </a>
            </span>
          ) : null}
        </div>
        <p className="note">{srcStatsText(data, l, e, src)}</p>
      </section>
      {blk ? (
        <section className="panel">
          <div className="panel-h">
            <span>{s(l, "cfg_title")}</span>
          </div>
          <pre className="cfgpre full">{blk}</pre>
        </section>
      ) : null}
      <section className="panel">
        <div className="panel-h">
          <span>{s(l, "src_topics_title")}</span>
          <span className="r">{fmt(s(l, "count"), { n: tops.length })}</span>
        </div>
        {tops.map((x, i) => {
          const xa = x.apps[x.apps.length - 1];
          return (
            <div className="row" key={x.slug}>
              <span className="rank">{i + 1}</span>
              <span className="rtitle">
                <Link href={`/${l}/topic/${x.slug}`}>{locTopicName(x, l)}</Link>
              </span>
              <Link className="tag" href={`/${l}/category/${catKey(xa.category)}`}>
                {catNameOf(data, xa.category, l)}
              </Link>
              <span className="note">
                {fmt(s(l, "src_topic_meta"), {
                  n: e.topicApps.get(x.slug) ?? 0,
                  d: edLabel(data.editions[e.topicLast.get(x.slug) ?? 0]),
                })}
              </span>
              <span className="heat">
                <span className="hv">
                  <b>{xa.heat}</b> <span>{s(l, "wave")}</span>
                </span>
              </span>
            </div>
          );
        })}
      </section>
      <Footer lang={l} />
    </div>
  );
}
