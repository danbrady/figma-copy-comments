// Copy Comments — main thread.
// The Plugin API has no comments API, so all REST calls happen in ui.html.
// This side only does what needs the document: node lookups, token storage,
// and remembering whether the welcome screen was dismissed.

var WELCOME_KEY = 'welcome:hidden';
var TOKEN_KEYS = {
  'https://api.figma.com': 'token:commercial',
  'https://api.figma-gov.com': 'token:gov'
};

var WIDTH = 440;
var HEIGHT = 600;
// About the setup screen's height. Opening at it avoids a jump from HEIGHT;
// the UI then measures itself and corrects the last few pixels.
var WELCOME_HEIGHT = 505;

// Settings are read before the window opens, so it opens at the right height.
(async function init() {
  var welcomeHidden = false;
  var tokens = {};
  try {
    welcomeHidden = !!(await figma.clientStorage.getAsync(WELCOME_KEY));
    for (var host in TOKEN_KEYS) {
      tokens[host] = (await figma.clientStorage.getAsync(TOKEN_KEYS[host])) || '';
    }
  } catch (_) {
    // Storage is a convenience; open the window either way.
  }
  figma.showUI(__html__, { width: WIDTH, height: welcomeHidden ? HEIGHT : WELCOME_HEIGHT, themeColors: true });
  figma.ui.onmessage = handleMessage;
  figma.ui.postMessage({
    type: 'init',
    fileName: figma.root.name,
    tokens: tokens,
    welcomeHidden: welcomeHidden
  });
})();

// Messages come from this plugin's own UI, but are still checked before use:
// anything malformed is ignored or answered with an error, never acted on.
async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  try {
    if (msg.type === 'save-token') {
      var key = TOKEN_KEYS[msg.host];
      if (!key) return;
      if (msg.token) await figma.clientStorage.setAsync(key, String(msg.token));
      else await figma.clientStorage.deleteAsync(key);
    } else if (msg.type === 'save-welcome') {
      if (msg.hide) await figma.clientStorage.setAsync(WELCOME_KEY, true);
      else await figma.clientStorage.deleteAsync(WELCOME_KEY);
    } else if (msg.type === 'resize') {
      // A measured height fits the window to the content; null restores the default.
      var height = Number(msg.height);
      figma.ui.resize(WIDTH, height > 0 ? Math.min(Math.max(Math.ceil(height), 240), 800) : HEIGHT);
    } else if (msg.type === 'locate') {
      if (!Array.isArray(msg.ids)) throw new Error('locate needs an array of ids');
      reply(msg.requestId, await locateNodes(msg.ids));
    } else if (msg.type === 'resolve') {
      if (!msg.locators || typeof msg.locators !== 'object') throw new Error('resolve needs a locators object');
      reply(msg.requestId, await resolveNodes(msg.locators));
    }
  } catch (err) {
    if (msg.requestId) reply(msg.requestId, null, String(err && err.message || err));
    else figma.notify('Copy Comments error: ' + (err && err.message || err), { error: true });
  }
}

function reply(requestId, result, error) {
  figma.ui.postMessage({ type: 'response', requestId: requestId, result: result, error: error || null });
}

// Export side: record where each commented node lives, so the import side can
// find it again if the .fig import changed node IDs.
async function locateNodes(ids) {
  var out = {};
  for (var i = 0; i < ids.length; i++) {
    var node = await figma.getNodeByIdAsync(ids[i]);
    if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
      out[ids[i]] = null;
      continue;
    }
    var path = [];
    var cur = node;
    while (cur && cur.type !== 'PAGE') {
      path.unshift(cur.name);
      cur = cur.parent;
    }
    var box = 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null;
    out[ids[i]] = {
      page: cur ? cur.name : null,
      path: path,
      type: node.type,
      abs: box ? { x: box.x, y: box.y } : null
    };
  }
  return out;
}

// Import side: map each original node ID to a node in this file.
// Same ID with the same name and type wins; otherwise walk page > path by name.
async function resolveNodes(locators) {
  var out = {};
  for (var oldId in locators) {
    var loc = locators[oldId];
    var node = await figma.getNodeByIdAsync(oldId);
    if (node && (!loc || (node.type === loc.type && node.name === loc.path[loc.path.length - 1]))) {
      out[oldId] = oldId;
      continue;
    }
    out[oldId] = loc ? await findByPath(loc) : null;
  }
  return out;
}

async function findByPath(loc) {
  var page = null;
  for (var i = 0; i < figma.root.children.length; i++) {
    if (figma.root.children[i].name === loc.page) {
      page = figma.root.children[i];
      break;
    }
  }
  if (!page) return null;
  await page.loadAsync();
  var cur = page;
  for (var j = 0; j < loc.path.length; j++) {
    if (!('children' in cur)) return null;
    var next = null;
    for (var k = 0; k < cur.children.length; k++) {
      if (cur.children[k].name === loc.path[j]) {
        next = cur.children[k];
        break;
      }
    }
    if (!next) return null;
    cur = next;
  }
  return cur.type === loc.type ? cur.id : null;
}
