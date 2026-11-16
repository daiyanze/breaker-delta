// Asset bridge for the official Workers deployment: the API token
// available to the deploy pipeline cannot upload Workers static
// assets, so the client chunks live in the data repo instead and
// this middleware serves them from its raw-content host. Inert
// unless BD_ASSETS_UPSTREAM is set (self-host builds serve their
// own chunks and never set it).

export function middleware(req: Request) {
  const upstream = process.env.BD_ASSETS_UPSTREAM;
  if (!upstream) return;
  const url = new URL(req.url);
  return fetch(upstream.replace(/\/+$/, "") + url.pathname, {
    headers: { accept: req.headers.get("accept") ?? "*/*" },
  }).then((res) => {
    if (!res.ok) return;
    const headers = new Headers(res.headers);
    // Chunk filenames are content-hashed: cache them hard.
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(res.body, { status: 200, headers });
  });
}

export const config = { matcher: "/_next/static/:path*" };
