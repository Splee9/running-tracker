// Bundles src/server/jev-rerank.ts into server-dist/jev-rerank.js for Vercel.
// The app imports sibling modules with .ts extensions. Vercel compiles each
// function file on its own and does not rewrite those extensions, so the
// function has to ship as one JavaScript file. api/jev-rerank.js is a committed
// re-export of this bundle: Vercel matches `functions` in vercel.json against
// the checked-out files before the build command runs.

import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("server-dist", { recursive: true });
await build({
  entryPoints: ["src/server/jev-rerank.ts"],
  outfile: "server-dist/jev-rerank.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "info",
});
