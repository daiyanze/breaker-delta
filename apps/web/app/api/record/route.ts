import { pushRecord, validateEntries } from "../../../lib/push";
import { checkPushAuth, jsonError } from "../../../lib/push-auth";

// POST /api/record — graded topics written back to the ledger
// store; same validation and result shape as the CLI's serve.
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
  try {
    const entries = validateEntries(parsed);
    const result = await pushRecord(entries);
    return Response.json(result);
  } catch (err) {
    return jsonError(400, err instanceof Error ? err.message : String(err));
  }
}
