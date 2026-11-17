// Shared push-API plumbing: the auth contract is the shared
// services implementation (Rewrite Phase 2b) — no BD_PUSH_TOKEN
// configured means the push API is disabled (403), a wrong or
// missing bearer token is 401. Same semantics as the CLI's serve.

import { checkBearerToken, type PushAuthResult } from "@breaker-delta/services";

export function pushToken(): string {
  return process.env.BD_PUSH_TOKEN ?? "";
}

export type AuthResult = PushAuthResult;

export function checkPushAuth(req: Request): AuthResult {
  return checkBearerToken(req.headers.get("authorization"), pushToken());
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
