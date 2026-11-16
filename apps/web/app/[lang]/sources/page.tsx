import Link from "next/link";
import { notFound } from "next/navigation";

import {
  sourceBlock,
  sourceKey,
  SOURCE_DOMAINS,
  yamlSourceBlocks,
} from "@breaker-delta/publisher";

import { Footer } from "../../../components/Footer";
import { Mast } from "../../../components/Mast";
import {
  getSiteData,
  isLang,
  locTopicName,
  sourceIndex,
  srcNameOf,
  srcStatsText,
  type Lang,
} from "../../../lib/data";
import { fmt, s } from "../../../lib/strings";

function sumOrd(x: string): number {
  let n = 0;
  for (const ch of x) n += ch.codePointAt(0) ?? 0;
  return n;
}

function firstAlnum(x: string): string {
  for (const ch of x) if (/[A-Za-z0-9]/.test(ch)) return ch;
  return [...x][0] ?? "";
}

export default async function SourcesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const data = await getSiteData();
  const idx = sourceIndex(data);
  const sorted = [...idx.stats.entries()].sort(
    (a, b) => b[1].apps - a[1].apps || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );
  const blocks = data.configText ? yamlSourceBlocks(data.configText) : new Map<string, string>();
  return (
    <div className="wrap">
      <Mast lang={l} active="sources" path="sources" />
      <section className="panel">
        <div className="panel-h">
          <span>{s(l, "sources_title")}</span>
          <span className="r">{fmt(s(l, "sources_r"), { n: idx.stats.size })}</span>
        </div>
        {sorted.map(([src, e]) => {
          const dom = SOURCE_DOMAINS[src];
          const hue = sumOrd(src) % 360;
          const tops = [...e.topics.values()].sort(
            (x, y) => y.apps[y.apps.length - 1].heat - x.apps[x.apps.length - 1].heat,
          );
          const blk = sourceBlock(src, blocks);
          return (
            <div key={src}>
              <div className="row">
                <span
                  className="av src-ic"
                  style={{ background: `hsl(${hue} 65% 72%)`, marginLeft: 0 }}
                >
                  {firstAlnum(srcNameOf(src, l))}
                </span>
                <span className="rtitle">
                  <Link href={`/${l}/source/${idx.fileBase.get(src)}`}>
                    {srcNameOf(src, l)}
                  </Link>
                  {dom ? (
                    <>
                      {" "}
                      <a href={`https://${dom}`} rel="noopener" className="note">
                        ↗
                      </a>
                    </>
                  ) : null}
                </span>
                <span className="note">{srcStatsText(data, l, e, src)}</span>
              </div>
              {blk ? (
                <details className="cfgdet">
                  <summary>⚙️ config · {sourceKey(src)}</summary>
                  <pre className="cfgpre">{blk}</pre>
                </details>
              ) : null}
              <div className="srctops" style={{ padding: "0 0 10px 43px" }}>
                {tops.map((x, i) => (
                  <span key={x.slug}>
                    {i > 0 ? " · " : ""}
                    <Link href={`/${l}/topic/${x.slug}`}>
                      {[...locTopicName(x, l)].slice(0, 22).join("")}
                    </Link>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </section>
      <Footer lang={l} />
    </div>
  );
}
