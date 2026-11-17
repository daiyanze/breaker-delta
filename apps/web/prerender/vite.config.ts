// Standalone vite config for the static prerender (Rewrite
// Phase 3c) — deliberately NOT the vinext config: this builds a
// plain Node SSR bundle that renders the app's page components
// to static HTML files, with next/* imports shimmed.

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "next/navigation", replacement: path.join(here, "navigation.ts") },
      { find: "next/link", replacement: path.join(here, "link.tsx") },
    ],
  },
  build: {
    ssr: path.join(here, "main.tsx"),
    outDir: path.join(here, "dist"),
    rollupOptions: {
      output: { entryFileNames: "prerender.mjs" },
    },
  },
  ssr: {
    // Bundle the workspace packages (their exports point at TS
    // sources via the monorepo's dist builds — the dist builds
    // are used as-is); only next shims and react are special.
    noExternal: ["@breaker-delta/i18n"],
  },
});
