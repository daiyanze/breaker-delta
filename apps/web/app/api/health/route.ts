import { dbPath, getSiteData } from "../../../lib/data";
import { pushToken } from "../../../lib/push-auth";

// GET /api/health — liveness + data summary (the CLI's serve
// reports its rendered-file count; the dynamic app renders per
// request, so it reports the data it would render).
export async function GET() {
  try {
    const data = await getSiteData();
    return Response.json({
      ok: true,
      editions: data.editions.length,
      topics: data.topics.length,
      pushApi: pushToken() !== "",
      backend: dbPath() !== null ? "sqlite" : "files",
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
