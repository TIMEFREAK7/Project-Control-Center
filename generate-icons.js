// PCC Redesign Gate 12 (App Icon & Branding): rasterizes src/icons/favicon.svg into the
// PNG sizes manifest.json and apple-touch-icon need. Dev-only tool, like build.js — the
// user never runs this. Uses the environment's real Chromium (no image-processing npm
// dependency added to the project) to render the SVG at each target size and screenshot
// it. Re-run with `node generate-icons.js` after editing src/icons/favicon.svg.
const fs = require("fs");
const path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const SVG_PATH = path.join(__dirname, "src", "icons", "favicon.svg");
const OUT_DIR = path.join(__dirname, "icons");

const SIZES = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);
  const svg = fs.readFileSync(SVG_PATH, "utf8");

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });

  for (const { file, size } of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const html = `<!doctype html><html><head><style>
      html,body{margin:0;padding:0;}
      svg{display:block;width:${size}px;height:${size}px;}
    </style></head><body>${svg}</body></html>`;
    await page.setContent(html);
    await page.waitForTimeout(50);
    await page.screenshot({ path: path.join(OUT_DIR, file), omitBackground: true });
    await page.close();
    console.log("Wrote", file, size + "x" + size);
  }

  await browser.close();
})();
