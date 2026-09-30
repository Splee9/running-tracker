// Renders the 1200×630 link-preview cards in public/og/ from src/lib/pages.ts. The PNGs
// are committed, so this only needs a rerun when a page's eyebrow or headline changes:
//
//   npm run og:images          # CHROME=/path/to/chrome overrides the browser
//
// Uses headless Chrome's --screenshot, so there is nothing to install beyond a browser.
// Prefer Playwright's chrome-headless-shell: full Chrome in headless mode can size its
// viewport shorter than --window-size, which crops the bottom of the card.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES } from "../src/lib/pages.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public");

const CANDIDATES = [
  process.env.CHROME,
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  "/opt/pw-browsers/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error("No Chrome found; set CHROME to a Chrome or Chromium binary");

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Site tokens from src/styles/global.css: off-white page, near-black ink, and the
// Chicago phase palette as a closing stripe.
const card = (page, route) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: #faf9f7; color: #1a1a1a;
    font-family: -apple-system, "Helvetica Neue", Helvetica, "Liberation Sans", Arial, sans-serif;
    padding: 88px 96px 0; display: flex; flex-direction: column;
  }
  .eyebrow { font-size: 26px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6b63; font-weight: 600; }
  h1 { margin-top: 28px; font-size: 92px; line-height: 1.02; letter-spacing: -0.03em; font-weight: 700; max-width: 980px; }
  .foot { margin-top: auto; padding-bottom: 56px; display: flex; justify-content: space-between; align-items: baseline;
          font-size: 26px; color: #6b6b63; border-top: 2px solid #e7e5e0; padding-top: 28px; }
  .foot b { color: #1a1a1a; font-weight: 700; }
  .stripe { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; display: flex; }
  .stripe i { flex: 1; }
</style></head><body>
  <p class="eyebrow">${escape(page.eyebrow)}</p>
  <h1>${escape(page.headline).replace(/ (\S+)$/, "&nbsp;$1")}</h1>
  <div class="foot"><b>Spencer Lee</b><span>${escape(route === "/" ? "Projects" : route)}</span></div>
  <div class="stripe"><i style="background:#2f2342"></i><i style="background:#7ca0e5"></i><i style="background:#e42f45"></i><i style="background:#b42b3f"></i></div>
</body></html>`;

const tmp = await mkdtemp(path.join(os.tmpdir(), "og-"));
try {
  for (const [route, page] of Object.entries(PAGES)) {
    const html = path.join(tmp, "card.html");
    const png = path.join(OUT, page.image);
    await writeFile(html, card(page, route));
    await mkdir(path.dirname(png), { recursive: true });
    execFileSync(
      chrome,
      [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--window-size=1200,630",
        `--screenshot=${png}`,
        `file://${html}`,
      ],
      { stdio: "ignore" },
    );
    console.log(`og: ${route} → public${page.image}`);
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
