/**
 * bd-web placeholder. It exists so CI, preview deploys and the two-Worker
 * layout are exercised from day one. M3 replaces it with the vinext site.
 * Rule that stays: this Worker only reads. See CLAUDE.md.
 */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Breaker Delta</title>
</head>
<body>
<h1>Breaker Delta</h1>
<p>2.0 scaffold. The site arrives in milestone M3.</p>
</body>
</html>`;

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") return Response.json({ ok: true });
    if (pathname === "/") {
      return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler;
