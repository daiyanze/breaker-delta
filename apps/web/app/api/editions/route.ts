import { validatePushEdition } from "@breaker-delta/services";

import { pushEdition } from "../../../lib/push";
import { checkPushAuth, jsonError } from "../../../lib/push-auth";

// POST /api/editions — one finished edition object; validation,
// status codes and messages are the shared push contract's
// (@breaker-delta/services), identical to the CLI's serve.
export async function POST(req: Request) {
  if (process.env.BD_DATA_BASE) {
    return jsonError(501, "push API is not available on the remote (read-only) backend");
  }
  const auth = checkPushAuth(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch (err) {
    return jsonError(400, `invalid JSON body: ${err instanceof Error ? err.message : String(err)}`);
  }
  let ed;
  try {
    ed = validatePushEdition(parsed);
  } catch (err) {
    return jsonError(400, err instanceof Error ? err.message : String(err));
  }
  const url = new URL(req.url);
  const result = await pushEdition(ed, url.searchParams.get("replace") === "1");
  if (!result.ok) return jsonError(409, result.conflict);
  return Response.json({ written: true, items: result.items });
}
