import { getSiteData } from "../../lib/data";
import { atomFeed } from "../../lib/feeds";

export async function GET() {
  const data = await getSiteData();
  return new Response(atomFeed(data, "zh"), {
    headers: { "content-type": "application/atom+xml; charset=utf-8" },
  });
}
