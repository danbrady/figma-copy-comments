// A stand-in for everything the plugin UI talks to, so scripts/visual-qa/run.mjs can drive
// the real dist/ui.html through every state:
// - FakeFigma answers Figma's REST API (api.figma.com) from an in-memory comment store,
//   with hooks for errors, rate limits, rewritten text, and requests held open.
// - BRIDGE plays the plugin's main thread (src/code.ts) inside the page.

// The account that made the token: every comment the plugin posts is by this person.
export const ME = { id: 'u-jordan', handle: 'Jordan Park', img_url: '' };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
};

export class FakeFigma {
  constructor() {
    this.files = {};
    this.nextId = 5000;
    this.counts = {};
    // Hooks a scenario can set:
    //   respond({ method, key, id, body, n }) -> { status, body, headers } | 'abort' | undefined
    //   hold({ method, n }) -> true parks the request until release()
    //   save(message, body) -> the text Figma stores (to imitate Figma rewriting it)
    //   drop(body, n) -> true to accept a post but never list it
    //   parent(commentId, body) -> the thread a reply is filed under
    this.hooks = {};
    this.parked = [];
  }

  comments(key) {
    if (!this.files[key]) this.files[key] = [];
    return this.files[key];
  }

  seed(key, comments) {
    this.comments(key).push(...comments.map((c) => ({ resolved_at: null, reactions: [], client_meta: null, ...c })));
  }

  release() {
    const parked = this.parked;
    this.parked = [];
    parked.forEach((resume) => resume());
  }

  async handle(route) {
    const req = route.request();
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const m = new URL(req.url()).pathname.match(/^\/v1\/files\/([^/]+)\/comments(?:\/([^/]+))?$/);
    if (!m) return route.fulfill({ status: 404, headers: CORS, body: '{"err":"Not found"}' });
    const [, key, id] = m;
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const n = this.counts[method] = (this.counts[method] || 0) + 1;
    const call = { method, key, id, body, n };

    if (this.hooks.hold && this.hooks.hold(call)) await new Promise((resume) => this.parked.push(resume));
    const custom = this.hooks.respond && this.hooks.respond(call);
    if (custom === 'abort') return route.abort('failed');
    if (custom) {
      return route.fulfill({ status: custom.status, headers: { ...CORS, ...(custom.headers || {}) },
        contentType: 'application/json', body: JSON.stringify(custom.body || { status: custom.status, err: 'Error' }) });
    }
    const json = (status, data) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(data) });
    const list = this.comments(key);

    if (method === 'GET') return json(200, { comments: list });
    if (method === 'POST') {
      const comment = {
        id: String(this.nextId++),
        user: ME,
        created_at: new Date(Date.UTC(2026, 9, 16, 14, 0, 0) + this.nextId * 1000).toISOString(),
        message: this.hooks.save ? this.hooks.save(body.message, body) : body.message,
        parent_id: body.comment_id ? (this.hooks.parent ? this.hooks.parent(body.comment_id, body) : body.comment_id) : null,
        client_meta: body.client_meta || null,
        resolved_at: null,
        reactions: [],
      };
      if (!(this.hooks.drop && this.hooks.drop(body, n))) list.push(comment);
      return json(200, comment);
    }
    if (method === 'DELETE') {
      const target = list.find((c) => c.id === id);
      if (!target) return json(404, { status: 404, err: 'Not found' });
      if (!target.user || target.user.id !== ME.id) return json(403, { status: 403, err: 'Forbidden' });
      this.files[key] = list.filter((c) => c.id !== id && c.parent_id !== id);
      return json(200, { status: 200, error: false });
    }
    return json(405, { err: 'Method not allowed' });
  }
}

// Runs in the page before dist/ui.html's script. The UI posts to `parent`, which is the page
// itself here, so this listener answers what src/code.ts would. window.__doc lists the layers
// in the "open file" by node id; window.__bridge.hold parks locate/resolve requests.
export const BRIDGE = `
// Figma provides Inter inside plugin windows; load it so the screenshots match.
document.addEventListener('DOMContentLoaded', () => {
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=block';
  document.head.appendChild(font);
});
window.__doc = { nodes: {} };
window.__bridge = { hold: {}, parked: [], resizes: [] };
window.__bridge.release = () => { const p = window.__bridge.parked; window.__bridge.parked = []; p.forEach((f) => f()); };
window.addEventListener('message', (event) => {
  const msg = event.data && event.data.pluginMessage;
  if (!msg || msg.type === 'init' || msg.type === 'response') return;
  if (msg.type === 'resize') { window.__bridge.resizes.push(msg.height); return; }
  let result = null;
  if (msg.type === 'locate') {
    result = {};
    msg.ids.forEach((id) => { result[id] = window.__doc.nodes[id] || null; });
  } else if (msg.type === 'resolve') {
    result = {};
    Object.keys(msg.locators).forEach((id) => { result[id] = window.__doc.nodes[id] ? id : null; });
  } else {
    return;
  }
  const answer = () => window.postMessage({ pluginMessage: { type: 'response', requestId: msg.requestId, result, error: null } }, '*');
  if (window.__bridge.hold[msg.type]) window.__bridge.parked.push(answer); else answer();
});
`;

// Figma sets these variables on plugin windows that use themeColors. These approximate
// Figma's dark theme; the light theme uses the fallbacks in src/ui.html.
export const DARK = `
:root {
  color-scheme: dark;
  --figma-color-bg: #2c2c2c;
  --figma-color-bg-secondary: #383838;
  --figma-color-text: #ffffff;
  --figma-color-text-secondary: #b3b3b3;
  --figma-color-border: #444444;
  --figma-color-bg-brand: #0c8ce9;
  --figma-color-text-brand: #7cc4f8;
  --figma-color-bg-selected: #394360;
  --figma-color-bg-hover: #383838;
  --figma-color-text-onbrand: #ffffff;
  --figma-color-text-danger: #fca397;
  --figma-color-text-success: #79d297;
  --figma-color-text-warning: #f7d15f;
}`;
