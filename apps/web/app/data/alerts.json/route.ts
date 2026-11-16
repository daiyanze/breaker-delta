import { alertsData } from "@breaker-delta/core";

import { getSiteData } from "../../../lib/data";

// The extension-facing alerts file: same payload core computes for
// the static build's data/alerts.json.
export async function GET() {
  const data = await getSiteData();
  return Response.json(alertsData(data.editions, data.topics));
}
