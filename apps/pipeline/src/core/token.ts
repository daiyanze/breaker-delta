/**
 * Bearer-token checks in constant time (#53). Both sides are hashed with
 * SHA-256 first, so the comparison always walks 32 bytes, whatever the
 * lengths, and where the first difference sits does not change its time.
 */

async function digest(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** True when `a` and `b` are the same string, compared in constant time. */
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * True when `request` carries `Authorization: Bearer <token>`. A null token
 * (not configured) matches nothing, so the route it guards fails closed.
 */
export async function bearerMatches(request: Request, token: string | null): Promise<boolean> {
  if (token === null || token === "") return false;
  const header = request.headers.get("authorization");
  if (header === null) return false;
  return sameSecret(header, `Bearer ${token}`);
}
