import { notFound } from "next/navigation";

import { getSiteData, isLang, type Lang } from "../../../lib/data";
import { rssFeed } from "../../../lib/feeds";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: string }> },
) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const data = await getSiteData();
  return new Response(rssFeed(data, lang as Lang), {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
