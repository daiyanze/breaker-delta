import { getSiteData } from "../../lib/data";
import { rssFeed } from "../../lib/feeds";

export async function GET() {
  const data = await getSiteData();
  return new Response(rssFeed(data, "zh"), {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
