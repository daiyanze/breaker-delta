import { BASE_URL } from "../../lib/feeds";

export async function GET() {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${BASE_URL}sitemap.xml\n`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
