import { HTML_LANG } from "@breaker-delta/publisher";

import { getSiteData, LANGS } from "../../lib/data";
import { BASE_URL } from "../../lib/feeds";

// llms.txt — the same content writeDiscovery produces for the
// static build, with route-shaped links.
export async function GET() {
  const data = await getSiteData();
  const sts = [...data.topics]
    .sort((a, b) => b.apps[b.apps.length - 1].heat - a.apps[a.apps.length - 1].heat)
    .slice(0, 10);
  const topLinks = sts
    .map(
      (t) =>
        `- [${t.apps[t.apps.length - 1].title}](${BASE_URL}topic/${encodeURIComponent(t.slug)})`,
    )
    .join("\n");
  const langLinks = LANGS.map(
    (L) => `- [${HTML_LANG[L]}](${BASE_URL}${L === "zh" ? "" : `${L}/`})`,
  ).join("\n");
  const docs = process.env.BD_DOCS_URL ?? "https://docs.breakerdelta.com/";
  const llms =
    `# 浪尖雷达 Breaker Delta\n\n> 用「浪高」量化话题走势的热点雷达：海浪榜（全部话题按浪高排名）、` +
    `涨潮榜（浪高涨幅）、回波（新出现的话题），每个话题有独立页面与海浪图（浪高历史走势）。\n\n` +
    `## 主要页面\n- [海浪榜](${BASE_URL})\n- [产品介绍 Landing](${BASE_URL}en/landing)\n- [涨潮榜](${BASE_URL}rising)\n` +
    `- [回波](${BASE_URL}echoes)\n- [分类](${BASE_URL}categories)\n` +
    `- [数据源](${BASE_URL}sources)\n- [战绩](${BASE_URL}track-record)\n` +
    `- [投波](${BASE_URL}submit)\n- [关于](${BASE_URL}about)\n- [文档 Docs](${docs}docs.html)\n- [Docs (English)](${docs}en/docs.html)\n` +
    `- [往期归档](${BASE_URL}archive)\n- [RSS](${BASE_URL}feed.xml)\n` +
    `- [Atom](${BASE_URL}atom.xml)\n\n## 语言版本\n${langLinks}\n\n## 当前浪高最高的话题\n${topLinks}\n`;
  return new Response(llms, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
