// Runs the built main thread (dist/code.js, from src/code.ts) against a small fake of the
// Figma Plugin API. Usage: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'code.js'), 'utf8');
// Objects made inside the VM aren't deepEqual to outside ones, so compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

// A document tree: pages hold frames, frames hold children. Every node gets an id, name, and type.
function node(id, name, type, children, box) {
  const n = { id, name, type, children: children || [], absoluteBoundingBox: box || { x: 0, y: 0 } };
  n.children.forEach((c) => { c.parent = n; });
  return n;
}

function fakeFigma({ pages = [], storage = {} } = {}) {
  const root = node('0:0', 'Doc', 'DOCUMENT', pages);
  pages.forEach((p) => { p.loadAsync = async () => {}; });
  const byId = {};
  (function index(n) { byId[n.id] = n; n.children.forEach(index); })(root);
  const sent = [];
  const calls = { showUI: [], resize: [], storageSet: {}, storageDeleted: [] };
  const figma = {
    root,
    getNodeByIdAsync: async (id) => byId[id] || null,
    clientStorage: {
      getAsync: async (k) => storage[k],
      setAsync: async (k, v) => { calls.storageSet[k] = v; },
      deleteAsync: async (k) => { calls.storageDeleted.push(k); },
    },
    showUI: (_html, opts) => calls.showUI.push(opts),
    notify: () => {},
    ui: { postMessage: (m) => sent.push(m), resize: (w, h) => calls.resize.push([w, h]) },
  };
  return { figma, sent, calls };
}

async function start(opts) {
  const env = fakeFigma(opts);
  vm.runInNewContext(src, { figma: env.figma, __html__: '<html></html>' });
  await new Promise((r) => setTimeout(r, 0));
  const ask = async (msg) => {
    await env.figma.ui.onmessage(msg);
    return env.sent.filter((m) => m.type === 'response' && m.requestId === msg.requestId).pop();
  };
  return Object.assign(env, { ask });
}

function sampleDoc() {
  const card = node('2:1', 'Card', 'FRAME', [node('2:2', 'Title', 'TEXT')], { x: 100, y: 50 });
  const dup = node('2:9', 'Card', 'FRAME');
  return [node('1:0', 'Page 1', 'PAGE', [card, dup]), node('3:0', 'Page 2', 'PAGE', [])];
}

test('startup opens at the setup-screen height on first run, and the full height once dismissed', async () => {
  const first = await start();
  assert.equal(first.calls.showUI[0].height, 522);
  assert.equal(first.sent[0].type, 'init');
  assert.equal(first.sent[0].welcomeHidden, false);

  const later = await start({ storage: { 'welcome:hidden': true } });
  assert.equal(later.calls.showUI[0].height, 600);
});

test('tokens are never stored, and ones saved by earlier versions are cleared at startup', async () => {
  const p = await start({ storage: { 'token:commercial': 'figd_old', 'token:gov': 'figd_gov' } });
  assert.equal('tokens' in p.sent[0], false);
  assert.deepEqual(p.calls.storageDeleted.sort(), ['token:commercial', 'token:gov']);
  await p.figma.ui.onmessage({ type: 'save-token', host: 'https://api.figma.com', token: 'figd_x' });
  assert.deepEqual(p.calls.storageSet, {});
});

test('locate records page, path, type, and position, and null for missing nodes', async () => {
  const p = await start({ pages: sampleDoc() });
  const res = await p.ask({ type: 'locate', requestId: 1, ids: ['2:2', '9:9', '1:0'] });
  assert.deepEqual(plain(res.result['2:2']), { page: 'Page 1', path: ['Card', 'Title'], type: 'TEXT', abs: { x: 0, y: 0 } });
  assert.equal(res.result['9:9'], null);
  assert.equal(res.result['1:0'], null, 'pages are not pin targets');
});

test('resolve keeps the same id when name and type match, else walks page and path by name', async () => {
  const p = await start({ pages: sampleDoc() });
  const res = await p.ask({ type: 'resolve', requestId: 2, locators: {
    '2:2': { page: 'Page 1', path: ['Card', 'Title'], type: 'TEXT' },
    // Same id exists but is a different node now: fall back to the path.
    '2:9': { page: 'Page 1', path: ['Card', 'Title'], type: 'TEXT' },
    // Id gone, path still there.
    '7:7': { page: 'Page 1', path: ['Card'], type: 'FRAME' },
    // Wrong type at the end of the path.
    '7:8': { page: 'Page 1', path: ['Card'], type: 'TEXT' },
    // Page gone.
    '7:9': { page: 'Old page', path: ['Card'], type: 'FRAME' },
    // No locator (frame was gone at export) and no node with that id.
    '8:8': null,
  } });
  assert.deepEqual(plain(res.result), { '2:2': '2:2', '2:9': '2:2', '7:7': '2:1', '7:8': null, '7:9': null, '8:8': null });
});

test('resize clamps the height, and null restores the default', async () => {
  const p = await start();
  await p.figma.ui.onmessage({ type: 'resize', height: 100 });
  await p.figma.ui.onmessage({ type: 'resize', height: 5000 });
  await p.figma.ui.onmessage({ type: 'resize', height: 503.2 });
  await p.figma.ui.onmessage({ type: 'resize', height: null });
  assert.deepEqual(p.calls.resize.map((r) => r[1]), [240, 800, 504, 600]);
});

test('malformed or unknown messages are ignored without throwing', async () => {
  const p = await start({ pages: sampleDoc() });
  await p.figma.ui.onmessage(null);
  await p.figma.ui.onmessage('hello');
  await p.figma.ui.onmessage({ type: 'nope' });
  const res = await p.ask({ type: 'locate', requestId: 5, ids: 'not-an-array' });
  assert.equal(res.result, null);
  assert.match(res.error, /ids/);
});
