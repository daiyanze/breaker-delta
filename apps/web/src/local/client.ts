/**
 * The client files under `/client/` (ADR 0020, section 11): `ui.css` today.
 * Run from source, the site builds them when it starts (`buildClient()`)
 * and serves them from memory, so every way of starting it gets them. The
 * executable never builds: `build:local` embeds `dist/client`, and it
 * serves those files only, so an executable built without them answers 404.
 * On Cloudflare the same files are static assets in `public/client`.
 *
 * Every file is revalidated on each load (ETag), so a page and its files
 * come from the same build.
 */
import { buildClient, type ClientFile } from "@bd/ui/build";

const TYPES: Readonly<Record<string, ClientFile["type"]>> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
};

/** True in an executable from `bun build --compile`: its own files are embedded. */
const compiled = () => Bun.embeddedFiles.length > 0;

/** The files `build:local` embedded: `--asset dist/client` names each `client/<path>`. */
async function embedded(): Promise<ClientFile[]> {
  const out: ClientFile[] = [];
  for (const blob of Bun.embeddedFiles) {
    const name = (blob as Blob & { name: string }).name;
    const type = TYPES[name.split(".").pop() ?? ""];
    if (!name.startsWith("client/") || type === undefined) continue;
    out.push({ path: name.slice(7), type, body: new Uint8Array(await blob.arrayBuffer()) });
  }
  return out;
}

interface Served {
  file: ClientFile;
  etag: string;
}

export interface ClientServer {
  /** Serves `/client/<path>`, or null for any other path. */
  serve(request: Request): Promise<Response> | null;
}

export function clientServer(
  load: () => Promise<readonly ClientFile[]> = compiled() ? embedded : buildClient,
): ClientServer {
  const files = load().then(
    (list) =>
      new Map<string, Served>(
        list.map((file) => [
          file.path,
          { file, etag: `"${Bun.hash(file.body).toString(36)}"` } satisfies Served,
        ]),
      ),
  );
  return {
    serve(request) {
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith("/client/")) return null;
      return files.then((map) => {
        const served = map.get(pathname.slice(8));
        if (served === undefined) return new Response("not found", { status: 404 });
        const headers = {
          "content-type": served.file.type,
          "cache-control": "no-cache",
          etag: served.etag,
        };
        if (request.headers.get("if-none-match") === served.etag) {
          return new Response(null, { status: 304, headers });
        }
        return new Response(served.file.body, { headers });
      });
    },
  };
}
