import { notFound } from "next/navigation";

import { getSiteData, isLang, type Lang } from "../../../lib/data";
import { atomFeed } from "../../../lib/feeds";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: string }> },
) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const data = await getSiteData();
  return new Response(atomFeed(data, lang as Lang), {
    headers: { "content-type": "application/atom+xml; charset=utf-8" },
  });
}
