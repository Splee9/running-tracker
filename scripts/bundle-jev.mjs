// Bundles src/server/jev-rerank.ts into api/jev-rerank.js for Vercel.
// The app imports sibling modules with .ts extensions. Vercel compiles each
// function file on its own and does not rewrite those extensions, so the
// function has to ship as one JavaScript file.

import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("api", { recursive: true });
await build({
  entryPoints: ["src/server/jev-rerank.ts"],
  outfile: "api/jev-rerank.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "info",
});
