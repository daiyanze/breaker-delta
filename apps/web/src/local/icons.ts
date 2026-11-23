/// <reference path="./assets.d.ts" />
/**
 * The icon files (issue #108), embedded in the local executable like the
 * fonts (`fonts.ts`). On Cloudflare the same folder is served as static
 * assets. `icons.test.ts` checks this list against `ICON_FILES`.
 */
import appleTouchIcon from "../../public/icons/apple-touch-icon.png" with { type: "file" };
import faviconSvg from "../../public/icons/favicon.svg" with { type: "file" };
import favicon16 from "../../public/icons/favicon-16.png" with { type: "file" };
import favicon32 from "../../public/icons/favicon-32.png" with { type: "file" };
import iconSvg from "../../public/icons/icon.svg" with { type: "file" };
import icon192 from "../../public/icons/icon-192.png" with { type: "file" };
import icon512 from "../../public/icons/icon-512.png" with { type: "file" };
import manifest from "../../public/icons/manifest.webmanifest" with { type: "file" };
import markSvg from "../../public/icons/mark.svg" with { type: "file" };

/** File name under `/icons/` to its embedded path and content type. */
export const ICON_PATHS: Readonly<Record<string, { path: string; type: string }>> = {
  "favicon.svg": { path: faviconSvg, type: "image/svg+xml" },
  "favicon-16.png": { path: favicon16, type: "image/png" },
  "favicon-32.png": { path: favicon32, type: "image/png" },
  "apple-touch-icon.png": { path: appleTouchIcon, type: "image/png" },
  "icon-192.png": { path: icon192, type: "image/png" },
  "icon-512.png": { path: icon512, type: "image/png" },
  "icon.svg": { path: iconSvg, type: "image/svg+xml" },
  "mark.svg": { path: markSvg, type: "image/svg+xml" },
  "manifest.webmanifest": { path: manifest, type: "application/manifest+json" },
};

/** Serves `/icons/<file>`, or null for any other path. */
export function serveIcon(request: Request): Response | null {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/icons/")) return null;
  const name = pathname.slice(7);
  const icon = Object.hasOwn(ICON_PATHS, name) ? ICON_PATHS[name] : undefined;
  if (icon === undefined) return new Response("not found", { status: 404 });
  return new Response(Bun.file(icon.path), {
    headers: { "content-type": icon.type, "cache-control": "public, max-age=86400" },
  });
}
