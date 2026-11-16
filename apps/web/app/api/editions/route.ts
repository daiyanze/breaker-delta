import type { Edition } from "@breaker-delta/core";

import { pushEdition } from "../../../lib/push";
import { checkPushAuth, jsonError } from "../../../lib/push-auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/editions — one finished edition object; same
// validation, status codes and messages as the CLI's serve.
export async function POST(req: Request) {
  const auth = checkPushAuth(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch (err) {
    return jsonError(400, `invalid JSON body: ${err instanceof Error ? err.message : String(err)}`);
  }
  const ed = parsed as { date?: unknown; slot?: unknown; items?: unknown };
  if (
    typeof ed?.date !== "string" ||
    !DATE_RE.test(ed.date) ||
    (ed.slot !== "morning" && ed.slot !== "evening") ||
    !Array.isArray(ed.items)
  ) {
    return jsonError(
      400,
      "edition must be an object with date (YYYY-MM-DD), slot (morning|evening) and items[]",
    );
  }
  const url = new URL(req.url);
  const result = await pushEdition(ed as Edition, url.searchParams.get("replace") === "1");
  if (!result.ok) return jsonError(409, result.conflict);
  return Response.json({ written: true, items: result.items });
}
