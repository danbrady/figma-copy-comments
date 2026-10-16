// Renders the Figma Community listing images in assets/listing/ from the pages in
// assets/listing/src/. The carousel pages show the real plugin UI, read from src/ui.html,
// so re-run this after changing the UI. Uses your installed Google Chrome;
// set CHROME_PATH to use another Chromium-based browser.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome } from './chrome.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets/listing/src');
const out = join(root, 'assets/listing');

const IMAGES = [
  { name: 'icon', width: 128, height: 128 },
  { name: 'cover', width: 1920, height: 1080 },
  { name: 'carousel-1-export', width: 1920, height: 1080 },
  { name: 'carousel-2-import', width: 1920, height: 1080 },
  { name: 'carousel-3-result', width: 1920, height: 1080 },
];

const uiHtml = await readFile(join(root, 'src/ui.html'), 'utf8');
const browser = await launchChrome();

try {
  for (const { name, width, height } of IMAGES) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (err) => { console.error(name + ': ' + err.message); });
    await page.addInitScript((html) => { window.PLUGIN_UI_HTML = html; }, uiHtml);
    await page.goto(pathToFileURL(join(src, name + '.html')).href);
    await page.waitForSelector('html[data-ready]', { state: 'attached', timeout: 15000 });
    await page.screenshot({ path: join(out, name + '.png') });
    await context.close();
    console.log('assets/listing/' + name + '.png  ' + width + '×' + height);
  }
} finally {
  await browser.close();
}
