import * as fs from "node:fs";
import * as path from "node:path";

// The brand mark, served from the engine repo's assets (the same
// file the static build copies into every language directory).
export async function GET() {
  const candidates = [
    process.env.BD_ENGINE_DIR
      ? path.join(process.env.BD_ENGINE_DIR, "assets/icon-96.png")
      : null,
    path.resolve(process.cwd(), "../../assets/icon-96.png"),
  ].filter((x): x is string => x !== null);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      return new Response(new Uint8Array(buf), {
        headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
      });
    }
  }
  return new Response("not found", { status: 404 });
}
