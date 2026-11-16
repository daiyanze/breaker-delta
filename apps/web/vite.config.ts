import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

// Two targets, one codebase (P2):
// - default (Node): `vite dev` / `vite build` run the app on Node —
//   the Docker/self-host shape, and the mode the data layer uses
//   until P2b moves storage behind SQLite/D1.
// - BD_TARGET=cf: Cloudflare Workers via @cloudflare/vite-plugin,
//   the official instance's shape.
export default defineConfig(() => {
  const plugins = [vinext()];
  if (process.env.BD_TARGET === "cf") {
    plugins.push(
      cloudflare({
        viteEnvironment: {
          name: "rsc",
          childEnvironments: ["ssr"],
        },
      }),
    );
  }
  return { plugins };
});
