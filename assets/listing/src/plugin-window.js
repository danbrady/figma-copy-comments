// Fills each .plugin-window[data-panel] with the real plugin UI: the <style> and the panel's
// markup from src/ui.html, which scripts/listing.mjs passes in as window.PLUGIN_UI_HTML.
// The page's window.demo[panel](doc) then puts the panel in the state the image shows.
// <html data-ready> tells the renderer every window is drawn. Every page loads this script,
// so pages with no window are marked ready too. A classic script, not a module: Chrome won't
// load modules from file:// pages.

const WIDTH = 440; // the plugin window's width (WIDTH in src/code.ts)
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=block">';

const CLOSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round"/></svg>';

const STATUS_ICONS = {
  success: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/>' +
    '<path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/>' +
    '<path d="M8 7.2v4.3" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="4.7" r="1" fill="#fff"/></svg>',
};

// The same markup setStatus() in src/ui.ts builds.
function setStatus(doc, id, { kind, title, body, note }) {
  const el = doc.getElementById(id);
  el.className = 'status ' + kind;
  el.innerHTML = '<span class="status-icon">' + STATUS_ICONS[kind] + '</span><div class="status-text">' +
    (title ? '<strong class="status-title">' + title + '</strong>' : '') +
    (body ? '<div class="status-body">' + body + '</div>' : '') +
    (note ? '<div class="status-note">' + note + '</div>' : '') + '</div>';
}

// The same markup renderSummary() in src/ui.ts builds.
function renderSummary(doc, id, rows) {
  const table = doc.getElementById(id);
  table.innerHTML = rows.map(([label, value]) => '<tr><td>' + label + '</td><td>' + value + '</td></tr>').join('');
  table.hidden = false;
}

function srcdoc(ui, panel) {
  const style = ui.querySelector('style').outerHTML;
  const tabs = ui.getElementById('tabs').cloneNode(true);
  const section = ui.getElementById('panel-' + panel).cloneNode(true);
  tabs.hidden = false;
  section.hidden = false;
  tabs.querySelectorAll('.tab').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.id === 'tab-' + panel));
  });
  return '<!doctype html><html><head><meta charset="utf-8">' + FONT + style +
    '<style>html, body { overflow: hidden; }</style></head><body>' + tabs.outerHTML + section.outerHTML + '</body></html>';
}

async function fill(win) {
  const panel = win.dataset.panel;
  const scale = Number(win.dataset.scale) || 1.5;
  const ui = new DOMParser().parseFromString(window.PLUGIN_UI_HTML, 'text/html');

  win.innerHTML = '<header>Copy Comments' + CLOSE + '</header><div class="viewport"><iframe></iframe></div>';
  const viewport = win.querySelector('.viewport');
  const frame = win.querySelector('iframe');
  frame.width = WIDTH;
  frame.style.transform = 'scale(' + scale + ')';
  await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = srcdoc(ui, panel); });

  const doc = frame.contentDocument;
  window.demo[panel](doc);
  await doc.fonts.ready;

  // Fit the window to the panel. data-scroll-to shows the panel scrolled to that element,
  // as the plugin's own window scrolls when the panel is taller than it.
  const height = doc.body.scrollHeight;
  const target = win.dataset.scrollTo && doc.querySelector(win.dataset.scrollTo);
  const top = target ? target.getBoundingClientRect().top - 12 : 0;
  frame.height = height;
  frame.style.marginTop = -top * scale + 'px';
  viewport.style.width = WIDTH * scale + 'px';
  viewport.style.height = (height - top) * scale + 'px';
}

window.PluginUI = { setStatus, renderSummary };

window.addEventListener('load', async () => {
  await Promise.all([...document.querySelectorAll('.plugin-window[data-panel]')].map(fill));
  await document.fonts.ready;
  document.documentElement.dataset.ready = '';
});
