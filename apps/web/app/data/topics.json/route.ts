import { topicsData } from "@breaker-delta/core";

import { getSiteData } from "../../../lib/data";

// The extension-facing data file: same payload core computes for
// the static build's data/topics.json.
export async function GET() {
  const data = await getSiteData();
  return Response.json(topicsData(data.editions, data.topics));
}
