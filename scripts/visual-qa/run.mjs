// Screenshots every screen and message of the plugin into docs/visual-qa/, by driving the
// built dist/ui.html in Chrome against a fake Figma (scripts/visual-qa/fake-figma.mjs).
// Usage: npm run visual-qa. Set CHROME_PATH to use a browser other than Google Chrome.
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { BRIDGE, DARK, FakeFigma } from './fake-figma.mjs';
import { GROUPS, SCENARIOS, TEXT_ONLY } from './scenarios.mjs';
import { writeReport } from './report.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'docs', 'visual-qa');
const ui = pathToFileURL(join(root, 'dist', 'ui.html')).href;
const THEMES = ['light', 'dark'];
const WIDTH = 440; // the plugin window's width (WIDTH in src/code.ts)
const only = process.argv[2]; // optional: run scenarios whose name includes this

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The text of a state, as the user sees it. **Bold** marks control names, as in src/ui.ts.
function captureText() {
  const shown = (el) => el && !el.hidden && el.getClientRects().length > 0;
  const marked = (el) => (el ? [...el.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : '**' + n.textContent + '**')).join('') : '');
  const statuses = ['offline', 'ex-status', 'im-status'].map((id) => document.getElementById(id))
    .filter((el) => shown(el) && el.children.length)
    .map((el) => ({
      kind: (el.className.match(/\b(success|warning|error|info|progress)\b/) || [])[1] || '',
      title: marked(el.querySelector('.status-title')),
      body: marked(el.querySelector('.status-body')),
      note: marked(el.querySelector('.status-note')),
      items: [...el.querySelectorAll('.status-list li')].map((li) => li.textContent),
    }));
  const summary = ['ex-summary', 'im-summary'].map((id) => document.getElementById(id)).filter(shown)
    .flatMap((t) => [...t.rows].map((r) => [r.cells[0].textContent, r.cells[1].textContent]));
  const welcome = document.getElementById('panel-welcome');
  const buttons = [...document.querySelectorAll('button')].filter((b) => shown(b) && !b.closest('#tabs') && b.textContent.trim())
    .map((b) => b.textContent.trim());
  const lines = (el) => el.innerText.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  return { statuses, summary, welcome: shown(welcome) ? lines(welcome) : '', buttons };
}

async function runScenario(browser, scenario, theme, shots) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 100 }, deviceScaleFactor: 2, acceptDownloads: false });
  const page = await context.newPage();
  const fake = new FakeFigma();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.route(/https:\/\/api\.figma(-gov)?\.com\//, (route) => fake.handle(route));
  await page.clock.install();
  await page.addInitScript(BRIDGE);
  if (theme === 'dark') {
    await page.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.classList.add('figma-dark');
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
      });
    }, DARK);
  }
  await page.goto(ui);

  // Waits for a condition in the page, moving the fake clock along so the plugin's
  // pacing, retries, and rechecks happen at once instead of in real time.
  async function until(fn, arg, what) {
    for (let i = 0; i < 2000; i++) {
      if (await page.evaluate(fn, arg)) return;
      await page.clock.runFor(500);
      await sleep(5);
    }
    throw new Error('Timed out waiting for ' + (what || fn.toString()));
  }

  const h = {
    page,
    fake,
    async init({ welcomeHidden = true, fileName = 'Checkout redesign', nodes = {} }) {
      await page.evaluate((n) => { window.__doc.nodes = n; }, nodes);
      await page.evaluate(([f, w]) => window.postMessage({ pluginMessage: { type: 'init', fileName: f, welcomeHidden: w } }, '*'),
        [fileName, welcomeHidden]);
      await until(() => !document.getElementById('tabs').hidden || !document.getElementById('panel-welcome').hidden, null, 'the plugin to open');
    },
    setNodes: (nodes) => page.evaluate((n) => { window.__doc.nodes = n; }, nodes),
    fill: (sel, value) => page.fill(sel, value),
    click: (sel) => page.click(sel),
    check: (sel) => page.check(sel),
    tab: (name) => page.click('#tab-' + name),
    chooseFile: (content) => page.setInputFiles('#im-file',
      { name: 'Checkout redesign - comments.json', mimeType: 'application/json', buffer: Buffer.from(content) }),
    offline: (on) => context.setOffline(on),
    // A step is done when its status isn't a progress line and its button works again.
    settle: (prefix, button) => until(([id, btn]) => {
      const el = document.getElementById(id);
      return el.children.length > 0 && !el.classList.contains('progress') && !document.querySelector(btn).disabled;
    }, [prefix + '-status', button || (prefix === 'ex' ? '#ex-run' : '#im-preview')], prefix + ' to finish'),
    waitText: (sel, text) => until(([s, t]) => document.querySelector(s).textContent.includes(t), [sel, text], '"' + text + '"'),
    async parked() {
      for (let i = 0; i < 2000 && !fake.parked.length; i++) {
        await page.clock.runFor(250);
        await sleep(5);
      }
      if (!fake.parked.length) throw new Error('Timed out waiting for a held request');
    },
    bridgeHold: (type) => page.evaluate((t) => { window.__bridge.hold[t] = true; }, type),
    bridgeParked: () => until(() => window.__bridge.parked.length > 0, null, 'a held main-thread request'),
    bridgeRelease: () => page.evaluate(() => { window.__bridge.hold = {}; window.__bridge.release(); }),
    async shot(group, id, name, when) {
      await page.evaluate(() => document.fonts.ready);
      // Animations are stopped so the spinner looks the same each run and unchanged screens stay byte-identical.
      await page.screenshot({ path: join(out, 'png', id + '.' + theme + '.png'), fullPage: true, animations: 'disabled' });
      if (!shots.has(id)) shots.set(id, { group, id, name, when, text: await page.evaluate(captureText) });
    },
  };

  try {
    await scenario.run(h);
  } finally {
    await context.close();
  }
  if (errors.length) throw new Error(scenario.name + ' (' + theme + '): page error: ' + errors.join('; '));
}

// Message text in src/ui.ts that the screens should reach, so a new message isn't missed.
async function uncovered(shots, textOnly) {
  const src = await readFile(join(root, 'src', 'ui.ts'), 'utf8');
  const patterns = [/title: '([^']+)'/g, /body: '([^']+)'/g, /failure\(err, '([^']+)'\)/g,
    /setStatus\('(?:ex|im)-status', '([^']+)'/g, /new (?:Plugin)?Error\('([^']+)'/g, /return '([^']+)'/g];
  const DEV_ONLY = ['Missing element #'];
  const clean = (s) => s.replace(/\\u([0-9a-f]{4})/gi, (_, x) => String.fromCharCode(parseInt(x, 16))).replace(/\*\*/g, '');
  const seen = [...shots.values()].map((s) => JSON.stringify(s.text)).concat(textOnly.map((s) => s.text)).join('\n').replace(/\*\*/g, '');
  const literals = new Set();
  patterns.forEach((re) => { for (const m of src.matchAll(re)) literals.add(clean(m[1]).slice(0, 30).trim()); });
  return [...literals].filter((l) => l.length > 3 && !DEV_ONLY.some((d) => l.startsWith(d)) && !seen.includes(l));
}

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'png'), { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const shots = new Map();
try {
  for (const scenario of SCENARIOS.filter((s) => !only || s.name.includes(only))) {
    for (const theme of THEMES) await runScenario(browser, scenario, theme, shots);
    process.stdout.write('.');
  }
} finally {
  await browser.close();
}
console.log('\n' + shots.size + ' states, ' + shots.size * THEMES.length + ' screenshots in docs/visual-qa/png/');

await writeReport(out, GROUPS, [...shots.values()], TEXT_ONLY, THEMES);
console.log('docs/visual-qa/index.html and docs/visual-qa/messages.md written');

if (!only) {
  const missing = await uncovered(shots, TEXT_ONLY);
  if (missing.length) {
    console.log('\nMessages in src/ui.ts no screen reached (add a scenario, or check they still show):');
    missing.forEach((m) => console.log('  - ' + m + '…'));
    process.exitCode = 1;
  } else {
    console.log('Every message in src/ui.ts appears in at least one screen.');
  }
}
