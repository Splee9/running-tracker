// Bundles each handler in src/server/ into server-dist/<name>.js for Vercel.
// The app imports sibling modules with .ts extensions. Vercel compiles each
// function file on its own and does not rewrite those extensions, so each
// function has to ship as one JavaScript file. api/<name>.js is a committed
// re-export of its bundle: Vercel matches `functions` in vercel.json against
// the checked-out files before the build command runs.

import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

const FUNCTIONS = ["jev-rerank", "activities", "pulse"];

await mkdir("server-dist", { recursive: true });
await build({
  entryPoints: FUNCTIONS.map((name) => `src/server/${name}.ts`),
  outdir: "server-dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "info",
});
