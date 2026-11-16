// Shared push-API plumbing: the auth contract mirrors the CLI's
// serve — no BD_PUSH_TOKEN configured means the push API is
// disabled (403), a wrong or missing bearer token is 401.

export function pushToken(): string {
  return process.env.BD_PUSH_TOKEN ?? "";
}

export type AuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function checkPushAuth(req: Request): AuthResult {
  const token = pushToken();
  if (token === "") {
    return { ok: false, status: 403, error: "push API disabled (set BD_PUSH_TOKEN)" };
  }
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return { ok: false, status: 401, error: "bad or missing bearer token" };
  }
  return { ok: true };
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
