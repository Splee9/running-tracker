// Writes one static HTML file per route after `vite build`, so link previews (Slack,
// iMessage, social cards) see each page's own title, description, and image. Crawlers
// don't run the app's JS, so document.title alone never reaches them.
//
// dist/index.html is "/", and every other route gets dist/<route>.html, which Netlify
// serves at the clean URL ahead of the SPA fallback in netlify.toml. Asset URLs from
// Vite are absolute, so the same page body works at any depth.
//
// Env: URL (set by Netlify to the site's primary URL) makes the og:url and og:image
// links absolute, as preview crawlers require.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES } from "../src/lib/pages.ts";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const SITE = (process.env.URL || "https://spencerruns.netlify.app").replace(/\/+$/, "");

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function head(route, page) {
  const url = SITE + (route === "/" ? "/" : route);
  const image = SITE + page.image;
  const tags = [
    ["name", "description", page.description],
    ["property", "og:type", "website"],
    ["property", "og:site_name", "Spencer Lee"],
    ["property", "og:title", page.title],
    ["property", "og:description", page.description],
    ["property", "og:url", url],
    ["property", "og:image", image],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", `${page.eyebrow}: ${page.headline}`],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", page.title],
    ["name", "twitter:description", page.description],
    ["name", "twitter:image", image],
  ];
  return [
    `<title>${escape(page.title)}</title>`,
    `<link rel="canonical" href="${escape(url)}" />`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escape(value)}" />`),
  ]
    .map((line) => `    ${line}`)
    .join("\n");
}

const template = await readFile(path.join(DIST, "index.html"), "utf8");
// index.html's own title and description are the dev-server defaults; each route replaces them.
const base = template
  .replace(/\s*<title>[\s\S]*?<\/title>/, "")
  .replace(/\s*<meta\s+name="description"[\s\S]*?\/>/, "");
if (!/\s*<\/head>/.test(base)) throw new Error("dist/index.html has no </head>");

for (const [route, page] of Object.entries(PAGES)) {
  const file = route === "/" ? "index.html" : `${route.slice(1)}.html`;
  const out = path.join(DIST, file);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, base.replace(/\s*<\/head>/, `\n${head(route, page)}\n  </head>`));
  console.log(`page-meta: ${route} → dist/${file}`);
}
