// Copy Comments — main thread.
// The Plugin API has no comments API, so all REST calls happen in the UI (src/ui.ts).
// This side only does what needs the document: node lookups, token storage,
// and remembering whether the welcome screen was dismissed.
import type { MainToUi, Requests, UiToMain } from './messages';
import type { Locator, Locators } from './types';

const WELCOME_KEY = 'welcome:hidden';
const TOKEN_KEYS: Record<string, string> = {
  'https://api.figma.com': 'token:commercial',
  'https://api.figma-gov.com': 'token:gov',
};

const WIDTH = 440;
const HEIGHT = 600;
// About the setup screen's height. Opening at it avoids a jump from HEIGHT;
// the UI then measures itself and corrects the last few pixels.
const WELCOME_HEIGHT = 505;

function post(message: MainToUi): void {
  figma.ui.postMessage(message);
}

// Settings are read before the window opens, so it opens at the right height.
(async function init() {
  let welcomeHidden = false;
  const tokens: Record<string, string> = {};
  try {
    welcomeHidden = !!(await figma.clientStorage.getAsync(WELCOME_KEY));
    for (const host of Object.keys(TOKEN_KEYS)) {
      tokens[host] = (await figma.clientStorage.getAsync(TOKEN_KEYS[host])) || '';
    }
  } catch {
    // Storage is a convenience; open the window either way.
  }
  figma.showUI(__html__, { width: WIDTH, height: welcomeHidden ? HEIGHT : WELCOME_HEIGHT, themeColors: true });
  figma.ui.onmessage = handleMessage;
  post({ type: 'init', fileName: figma.root.name, tokens, welcomeHidden });
})();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

// Messages come from this plugin's own UI, but are still checked before use:
// anything malformed is ignored or answered with an error, never acted on.
async function handleMessage(raw: unknown): Promise<void> {
  if (!isRecord(raw)) return;
  const msg = raw as Partial<UiToMain> & Record<string, unknown>;
  const requestId = typeof msg.requestId === 'number' ? msg.requestId : 0;
  try {
    if (msg.type === 'save-token') {
      const key = TOKEN_KEYS[String(msg.host)];
      if (!key) return;
      if (msg.token) await figma.clientStorage.setAsync(key, String(msg.token));
      else await figma.clientStorage.deleteAsync(key);
    } else if (msg.type === 'save-welcome') {
      if (msg.hide) await figma.clientStorage.setAsync(WELCOME_KEY, true);
      else await figma.clientStorage.deleteAsync(WELCOME_KEY);
    } else if (msg.type === 'resize') {
      // A measured height fits the window to the content; null restores the default.
      const height = Number(msg.height);
      figma.ui.resize(WIDTH, height > 0 ? Math.min(Math.max(Math.ceil(height), 240), 800) : HEIGHT);
    } else if (msg.type === 'locate') {
      if (!Array.isArray(msg.ids)) throw new Error('locate needs an array of ids');
      reply(requestId, await locateNodes(msg.ids.map(String)));
    } else if (msg.type === 'resolve') {
      if (!isRecord(msg.locators)) throw new Error('resolve needs a locators object');
      reply(requestId, await resolveNodes(msg.locators as Locators));
    }
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (requestId) reply(requestId, null, text);
    else figma.notify('Copy Comments error: ' + text, { error: true });
  }
}

function reply(requestId: number, result: unknown, error?: string): void {
  post({ type: 'response', requestId, result, error: error || null });
}

// Export side: record where each commented node lives, so the import side can
// find it again if the .fig import changed node IDs.
async function locateNodes(ids: string[]): Promise<Requests['locate']['result']> {
  const out: Locators = {};
  for (const id of ids) {
    const node = await figma.getNodeByIdAsync(id);
    if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
      out[id] = null;
      continue;
    }
    const path: string[] = [];
    let cur: BaseNode | null = node;
    while (cur && cur.type !== 'PAGE') {
      path.unshift(cur.name);
      cur = cur.parent;
    }
    const box = 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null;
    out[id] = {
      page: cur ? cur.name : null,
      path,
      type: node.type,
      abs: box ? { x: box.x, y: box.y } : null,
    };
  }
  return out;
}

// Import side: map each original node ID to a node in this file.
// Same ID with the same name and type wins; otherwise walk page > path by name.
async function resolveNodes(locators: Locators): Promise<Requests['resolve']['result']> {
  const out: Record<string, string | null> = {};
  for (const oldId of Object.keys(locators)) {
    const loc = locators[oldId];
    const node = await figma.getNodeByIdAsync(oldId);
    if (node && (!loc || (node.type === loc.type && node.name === loc.path[loc.path.length - 1]))) {
      out[oldId] = oldId;
      continue;
    }
    out[oldId] = loc ? await findByPath(loc) : null;
  }
  return out;
}

async function findByPath(loc: Locator): Promise<string | null> {
  const page = figma.root.children.find((p) => p.name === loc.page);
  if (!page) return null;
  await page.loadAsync();
  let cur: BaseNode = page;
  for (const name of loc.path) {
    if (!('children' in cur)) return null;
    const next: SceneNode | undefined = cur.children.find((child) => child.name === name);
    if (!next) return null;
    cur = next;
  }
  return cur.type === loc.type ? cur.id : null;
}
