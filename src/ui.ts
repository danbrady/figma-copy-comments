// Copy Comments — UI (runs in the plugin's iframe).
// Makes the REST calls (the Plugin API has no comments API) and asks the main thread
// (src/code.ts) for anything that needs the document. Built into dist/ui.html.
import {
  FORMAT, buildPlan, checkOpenFile, commentNodeIds, countMentions, describeCopy, findAltered, formatWait,
  groupCopied, misplacedList, parseFileLink, safeFileName, verifyImport,
} from './logic';
import type { CopiedGroup, FileLink, Plan, SentComment } from './logic';
import type { MainToUi, Requests, UiToMain } from './messages';
import type { ClientMeta, ExportFile, FigmaComment, Locators } from './types';

// ---------- Errors ----------
type StatusKind = 'success' | 'warning' | 'error' | 'info' | 'progress';

// An error the UI knows how to show. `fatal` stops a run instead of skipping one comment;
// `status` is the HTTP status; `title` and `kind` override the alert used to show it.
class PluginError extends Error {
  fatal: boolean;
  status?: number;
  title?: string;
  kind?: StatusKind;
  constructor(message: string, options: { fatal?: boolean; status?: number; title?: string; kind?: StatusKind } = {}) {
    super(message);
    this.fatal = !!options.fatal;
    this.status = options.status;
    this.title = options.title;
    this.kind = options.kind;
  }
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isFatal = (err: unknown) => err instanceof PluginError && err.fatal;
const statusOf = (err: unknown) => (err instanceof PluginError ? err.status : undefined);

// The alert for a failed step: the error's own title and kind if it has them, such as being offline.
function failure(err: unknown, title: string): StatusMessage {
  const e = err instanceof PluginError ? err : null;
  return { kind: (e && e.kind) || 'error', title: (e && e.title) || title, body: messageOf(err) };
}

// ---------- Plugin bridge ----------
// The token is only kept in memory while the window is open; it's never stored.
interface ReadInputs {
  link: FileLink;
  token: string;
}

let nextRequest = 1;
const pending = new Map<number, { resolve: (result: unknown) => void; reject: (err: Error) => void }>();
let fileName = '';
let lastExport: ExportFile | null = null;
let importPlan: Plan | null = null;
let importTarget: ReadInputs | null = null;

function send(msg: UiToMain): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function ask<K extends keyof Requests>(type: K, payload: Requests[K]['payload']): Promise<Requests[K]['result']> {
  return new Promise((resolve, reject) => {
    const requestId = nextRequest++;
    pending.set(requestId, { resolve: resolve as (result: unknown) => void, reject });
    send({ type, requestId, ...payload } as UiToMain);
  });
}

window.onmessage = (event: MessageEvent) => {
  const msg: MainToUi | undefined = event.data && event.data.pluginMessage;
  if (!msg) return;
  if (msg.type === 'init') {
    fileName = msg.fileName;
    showWelcome(!msg.welcomeHidden);
  } else if (msg.type === 'response') {
    const p = pending.get(msg.requestId);
    if (!p) return;
    pending.delete(msg.requestId);
    if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg.result);
  }
};

// ---------- REST ----------
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function friendlyError(status: number, detail: string, method: string): string {
  const scope = method === 'GET' ? 'file_comments:read' : 'file_comments:write';
  if (status === 403) return 'Figma refused the request (403). Check that the token was made by an account that can open ' +
    'this file, hasn\u2019t expired, and has the scope ' + scope + '.';
  if (status === 404) return 'File not found (404). Check the link.';
  if (status === 400) return 'Figma rejected the request (400): ' + detail;
  return 'Figma returned ' + status + ': ' + detail;
}

// Figma's comment endpoints allow 25 to 100 requests a minute for Full and Dev seats,
// and about 5 for View and Collab seats. Posts start at 40 a minute, and every 429
// halves that, down to 5 a minute, for the rest of the session.
const pacing = { interval: 1500, next: 0 };
const MAX_WAIT_SECONDS = 300;
const BACKOFF_SECONDS = [15, 30, 60, 60, 60, 60];
const SEAT_NOTE = 'Figma limits how fast each account can use its API, and View and Collab seats get the lowest limit. ' +
  'Try again later, or have someone with a Full or Dev seat do this step.';

async function pace(): Promise<void> {
  const wait = pacing.next - Date.now();
  if (wait > 0) await sleep(wait);
  pacing.next = Date.now() + pacing.interval;
}

function postsPerMinute(): number {
  return Math.round(60000 / pacing.interval);
}

type Method = 'GET' | 'POST' | 'DELETE';

function offlineError(): PluginError {
  return new PluginError('Copy Comments needs an internet connection to reach Figma\u2019s API. Reconnect, then try again.', { fatal: true, title: 'You\u2019re offline', kind: 'warning' });
}

// onWait(seconds), if given, is called before sleeping on a rate limit, so the status can say so.
async function api<T = unknown>(apiHost: string, token: string, method: Method, path: string,
  body?: object | null, onWait?: (seconds: number) => void): Promise<T> {
  for (let attempt = 0; attempt < BACKOFF_SECONDS.length; attempt++) {
    if (!navigator.onLine) throw offlineError();
    let res: Response;
    try {
      const headers: Record<string, string> = { 'X-Figma-Token': token };
      if (body) headers['Content-Type'] = 'application/json';
      res = await fetch(apiHost + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      if (!navigator.onLine) throw offlineError();
      throw new PluginError('Could not reach ' + apiHost + '. Check your connection. If it\u2019s working, your network ' +
        'or browser may be blocking this plugin from calling Figma\u2019s API.', { fatal: true });
    }
    if (res.status === 429) {
      // Retry-After is often unreadable from a plugin (CORS), so there's a fallback schedule.
      const retry = Number(res.headers.get('Retry-After'));
      if (retry > MAX_WAIT_SECONDS) {
        throw new PluginError('Figma asked to wait ' + formatWait(retry) + ' before it takes more requests from this account. ' + SEAT_NOTE,
          { fatal: true });
      }
      pacing.interval = Math.min(pacing.interval * 2, 12000);
      const wait = retry > 0 ? retry : BACKOFF_SECONDS[attempt];
      if (onWait) onWait(wait);
      await sleep(wait * 1000);
      continue;
    }
    const text = await res.text();
    let data: { err?: string; message?: string } & Record<string, unknown>;
    try { data = JSON.parse(text); } catch { data = { err: text }; }
    if (!res.ok) {
      throw new PluginError(friendlyError(res.status, data.err || data.message || text, method), {
        status: res.status,
        fatal: res.status === 401 || res.status === 403 || res.status === 404,
      });
    }
    return data as T;
  }
  throw new PluginError('Figma kept limiting the requests, even after waiting. ' + SEAT_NOTE, { fatal: true });
}

interface CommentsResponse {
  comments?: FigmaComment[];
}

function getComments(link: FileLink, token: string, onWait?: (seconds: number) => void): Promise<CommentsResponse> {
  return api<CommentsResponse>(link.apiHost, token, 'GET', '/v1/files/' + link.key + '/comments', null, onWait);
}

// ---------- UI helpers ----------
function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing element #' + id);
  return el;
}
const inputEl = (id: string) => $(id) as HTMLInputElement;
const buttonEl = (id: string) => $(id) as HTMLButtonElement;
const tableEl = (id: string) => $(id) as HTMLTableElement;

type Tab = 'export' | 'import';
let currentTab: Tab = 'export';

// The welcome screen replaces the tabs until Continue is clicked.
function showWelcome(show: boolean): void {
  $('panel-welcome').hidden = !show;
  $('tabs').hidden = show;
  if (show) {
    inputEl('welcome-hide').checked = true;
    $('panel-export').hidden = true;
    $('panel-import').hidden = true;
  } else {
    showTab(currentTab);
  }
  // The welcome screen is short, so fit the window to it; the tabs use the default height.
  requestAnimationFrame(() => {
    send({ type: 'resize', height: show ? Math.ceil(document.body.getBoundingClientRect().height) : null });
  });
}

function showTab(mode: Tab): void {
  currentTab = mode;
  const isImport = mode === 'import';
  $('tab-export').setAttribute('aria-selected', String(!isImport));
  $('tab-import').setAttribute('aria-selected', String(isImport));
  // Only the selected tab is in the Tab order; arrow keys move between tabs.
  $('tab-export').tabIndex = isImport ? -1 : 0;
  $('tab-import').tabIndex = isImport ? 0 : -1;
  $('panel-export').hidden = isImport;
  $('panel-import').hidden = !isImport;
}

const UNMATCHED_NOTE = 'Comments pinned to frames this file doesn’t have go near their old spot, or the ' +
  'top-left of the canvas if the frame was deleted. Their text says where they were.';

// Figma can't move a reply, so a misplaced one is deleted and posted again.
function misplacedHelp(n: number): string {
  return (n === 1 ? '1 reply is' : n + ' replies are') + ' under the wrong thread. A re-run won’t move ' +
    (n === 1 ? 'it' : 'them') + ': delete ' + (n === 1 ? 'that reply' : 'those replies') + ' in this file, then click ' +
    '**Preview** and **Post comments** again to post ' + (n === 1 ? 'it' : 'them') + ' in the right thread.';
}

// Who Figma may tell about the posts. Followers get grouped emails and in-app notifications;
// an @mention, if Figma makes it live again, reaches that person whatever their settings.
function notifyNote(mentions: number): string {
  return 'People who follow this file may be notified about the new comments.' + (mentions
    ? ' ' + (mentions === 1 ? '1 of them @mentions someone' : mentions + ' of them @mention people') +
      ', and Figma may notify the people mentioned even if they’ve turned notifications off.'
    : '');
}

// Static, trusted markup. Filled shapes use currentColor; the marks inside are white.
const ICONS: Record<StatusKind, string> = {
  success: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/>' +
    '<path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warning: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.13 1.5a1 1 0 0 1 1.74 0l6.95 12.5A1 1 0 0 1 14.95 15.5H1.05a1 1 0 0 1-.87-1.5z" fill="currentColor"/>' +
    '<path d="M8 5.8v4" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="12.6" r="1" fill="#fff"/></svg>',
  error: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/>' +
    '<path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/>' +
    '<path d="M8 7.2v4.3" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="4.7" r="1" fill="#fff"/></svg>',
  progress: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="2"/>' +
    '<path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

interface StatusMessage {
  kind: StatusKind;
  title?: string;
  body?: string;
  note?: string;
  // Comments the message is about, listed below it so they can be found in the file.
  items?: string[];
}

const MAX_ITEMS = 10;

// Status text may wrap control names in **double asterisks**, which show in bold.
// Built from text nodes, so message text (including Figma error details) is never parsed as HTML.
function appendMarked(node: HTMLElement, content: string): void {
  content.split(/\*\*(.+?)\*\*/g).forEach((part, i) => {
    if (!part) return;
    if (i % 2) {
      const strong = document.createElement('strong');
      strong.textContent = part;
      node.appendChild(strong);
    } else {
      node.appendChild(document.createTextNode(part));
    }
  });
}

// setStatus(id, 'Working…') shows a progress line.
// setStatus(id, { kind, title, body, note }) shows an alert; kind is success, warning, error, or info.
function setStatus(id: string, status: string | StatusMessage): void {
  const msg: StatusMessage = typeof status === 'string' ? { kind: 'progress', body: status } : status;
  const el = $(id);
  el.innerHTML = '';
  el.className = 'status ' + msg.kind;
  const icon = document.createElement('span');
  icon.className = 'status-icon';
  icon.innerHTML = ICONS[msg.kind];
  const text = document.createElement('div');
  text.className = 'status-text';
  ([['status-title', msg.title, 'strong'], ['status-body', msg.body, 'div'], ['status-note', msg.note, 'div']] as const)
    .forEach(([className, content, tag]) => {
      if (!content) return;
      const node = document.createElement(tag);
      node.className = className;
      appendMarked(node, content);
      text.appendChild(node);
    });
  if (msg.items && msg.items.length) {
    const list = document.createElement('ul');
    list.className = 'status-list';
    const shown = msg.items.slice(0, MAX_ITEMS);
    if (msg.items.length > MAX_ITEMS) shown.push('…and ' + (msg.items.length - MAX_ITEMS) + ' more');
    shown.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    text.appendChild(list);
  }
  el.appendChild(icon);
  el.appendChild(text);
}

// A status updater for api()'s onWait. `then` is what happens after the wait.
function waitStatus(id: string, then: string): (seconds: number) => void {
  return (seconds) => {
    setStatus(id, 'Figma is limiting requests, so waiting ' + formatWait(seconds) + ', then ' + then + '. Keep this window open.');
  };
}

type SummaryRow = [string, string | number] | null | false;

// Rows are [label, value]; a falsy row is left out.
function renderSummary(id: string, rows: SummaryRow[]): void {
  const table = tableEl(id);
  table.innerHTML = '';
  const shown = rows.filter((row): row is [string, string | number] => !!row);
  shown.forEach(([label, value]) => {
    const tr = document.createElement('tr');
    const a = document.createElement('td');
    const b = document.createElement('td');
    a.textContent = label;
    b.textContent = String(value);
    tr.appendChild(a);
    tr.appendChild(b);
    table.appendChild(tr);
  });
  table.hidden = shown.length === 0;
}

function readInputs(prefix: 'ex' | 'im'): ReadInputs {
  const link = parseFileLink(inputEl(prefix + '-link').value);
  if (!link) throw new Error('Paste a link to this file. In Figma, use **Share \u203a Copy link**.');
  const token = inputEl(prefix + '-token').value.trim();
  if (!token) throw new Error('Paste a personal access token.');
  return { link, token };
}

function download(data: ExportFile): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safeFileName(data.source.fileName);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- Export ----------
async function runExport(): Promise<void> {
  buttonEl('ex-run').disabled = true;
  $('ex-summary').hidden = true;
  try {
    const input = readInputs('ex');
    setStatus('ex-status', 'Reading comments…');
    const res = await getComments(input.link, input.token, waitStatus('ex-status', 'reading comments'));
    const comments = res.comments || [];

    setStatus('ex-status', 'Recording where each comment is pinned…');
    const nodeIds = commentNodeIds(comments);
    const locators = await ask('locate', { ids: nodeIds });
    const check = checkOpenFile(comments, locators);

    lastExport = {
      format: FORMAT,
      exported_at: new Date().toISOString(),
      source: { apiHost: input.link.apiHost, fileKey: input.link.key, fileName },
      comments,
      locators,
    };
    download(lastExport);

    const roots = comments.filter((c) => !c.parent_id);
    renderSummary('ex-summary', [
      ['Threads', roots.length],
      ['Replies', comments.length - roots.length],
      ['Resolved threads', roots.filter((c) => c.resolved_at).length],
      ['Pinned to frames', nodeIds.length],
    ]);
    $('ex-again').hidden = false;
    if (check.wrongFile) {
      setStatus('ex-status', { kind: 'warning', title: 'Check the link',
        body: 'The comments were exported, but none of the frames they’re pinned to are in the open file. ' +
          'Make sure the link you pasted is for the file that’s open right now, then export again.' });
    } else {
      const n = check.threadsWithoutFrame;
      setStatus('ex-status', { kind: 'success', title: 'Export complete',
        body: comments.length + ' comments were saved to “' + safeFileName(fileName) + '”.',
        note: n ? n + (n === 1 ? ' thread is pinned to a deleted frame' : ' threads are pinned to deleted frames') + '. On import, ' +
          (n === 1 ? 'it goes' : 'they go') + ' to the top-left of the canvas unless you tick **Skip threads whose frame was deleted**.' : '' });
    }
  } catch (err) {
    setStatus('ex-status', failure(err, 'Export failed'));
  } finally {
    buttonEl('ex-run').disabled = false;
  }
}

// ---------- Import ----------
function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(String(reader.result))); } catch { reject(new Error('That file is not valid JSON.')); }
    };
    reader.onerror = () => { reject(new Error('Could not read that file.')); };
    reader.readAsText(file);
  });
}

function isExportFile(data: unknown): data is ExportFile {
  const d = data as Partial<ExportFile> | null;
  return !!d && d.format === FORMAT && Array.isArray(d.comments) && !!d.source;
}

async function runPreview(): Promise<void> {
  removal = null;
  showRemoveConfirm(false);
  buttonEl('im-preview').disabled = true;
  $('im-run').hidden = true;
  $('im-summary').hidden = true;
  importPlan = null;
  try {
    const input = readInputs('im');
    const file = inputEl('im-file').files?.[0];
    if (!file) throw new Error('Choose the .json file that **Export** downloaded.');
    const data = await readJsonFile(file);
    if (!isExportFile(data)) throw new Error('That file was not exported by Copy Comments.');
    if (data.source.apiHost === input.link.apiHost && data.source.fileKey === input.link.key) {
      throw new Error('This is the same file the comments were exported from. Open the file you’re copying TO and use the **Import** tab there.');
    }

    setStatus('im-status', 'Checking comments already in this file…');
    const existing = (await getComments(input.link, input.token, waitStatus('im-status', 'checking comments'))).comments || [];

    // Pins are matched in the open file but posted to the linked one, so they must be the same file.
    const targetIds = commentNodeIds(existing);
    if (targetIds.length) {
      const here = await ask('locate', { ids: targetIds });
      if (checkOpenFile(existing, here).wrongFile) {
        throw new PluginError('The file in the link has comments pinned to frames that aren’t in the open file, ' +
          'so the link is probably for a different file. Copy the link of the file that’s open right now, then click **Preview** again.',
          { title: 'Check the link', kind: 'warning' });
      }
    }

    setStatus('im-status', 'Matching pinned frames…');
    const wanted: Locators = {};
    const locators = data.locators || {};
    commentNodeIds(data.comments).forEach((id) => { wanted[id] = locators[id] || null; });
    const nodeMap = await ask('resolve', { locators: wanted });

    importTarget = input;
    importPlan = buildPlan(data, existing, nodeMap,
      { skipResolved: inputEl('im-skip-resolved').checked, skipDeletedFrames: inputEl('im-skip-deleted').checked });
    const plan = importPlan;
    const c = plan.counts;
    renderSummary('im-summary', [
      ['From', data.source.fileName],
      ['Threads', c.roots],
      ['Replies', c.replies],
      c.skipped ? ['Skipped: resolved threads and their replies', c.skipped]
        : c.resolved ? ['Resolved threads (noted in text)', c.resolved] : null,
      c.skippedDeleted ? ['Skipped: threads on deleted frames and their replies', c.skippedDeleted] : null,
      c.done ? ['Already copied (will skip)', c.done] : null,
      c.unrecognized ? ['Copied earlier, not recognized', c.unrecognized] : null,
      c.misplaced ? ['Replies under the wrong thread', c.misplaced] : null,
      c.unmatched ? ['Pins that could not be matched', c.unmatched] : null,
      ['Comments to post now', c.toPost],
    ]);
    const misplacedNote = c.misplaced ? misplacedHelp(c.misplaced) : '';
    const misplaced = misplacedList(plan, plan.misplaced.map((r) => r.sourceId));
    const minutes = Math.max(1, Math.ceil(c.toPost * pacing.interval / 60000));
    const timing = 'They’ll be posted under your name, about ' + postsPerMinute() + ' a minute, so this takes about ' +
      minutes + (minutes === 1 ? ' minute' : ' minutes') + '. Keep this window open while posting. ' + notifyNote(countMentions(plan));
    if (c.toPost === 0 && c.done === 0 && (c.skipped || c.skippedDeleted)) {
      setStatus('im-status', { kind: 'success', title: 'Nothing to post',
        body: 'Every thread is left out by the skip options above.' });
    } else if (c.toPost === 0 && c.misplaced) {
      setStatus('im-status', { kind: 'warning', title: 'Some replies are in the wrong thread',
        body: 'Every comment is in this file. ' + misplacedNote, items: misplaced });
    } else if (c.toPost === 0) {
      setStatus('im-status', { kind: 'success', title: 'Already up to date',
        body: 'Every comment has already been copied to this file.' });
    } else if (c.unrecognized) {
      setStatus('im-status', { kind: 'warning', title: 'Check before posting',
        body: (c.unrecognized === 1
          ? 'This file has 1 copied comment that doesn’t match this export file. If it came from the same original file, ' +
            'posting now would duplicate it. That happens when the export file is newer than the one used before, ' +
            'or when Figma changed its text. Post only if it came from a different file.'
          : 'This file has ' + c.unrecognized + ' copied comments that don’t match this export file. If they came from ' +
            'the same original file, posting now would duplicate them. That happens when the export file is newer than ' +
            'the one used before, or when Figma changed their text. Post only if they came from a different file.'),
        note: [timing, c.unmatched ? UNMATCHED_NOTE : '', misplacedNote].filter(Boolean).join('\n\n'), items: misplaced });
      $('im-run').hidden = false;
    } else {
      setStatus('im-status', { kind: 'info', title: 'Ready to post ' + c.toPost + (c.toPost === 1 ? ' comment' : ' comments'),
        body: timing + ' Review the numbers, then click **Post comments**.',
        note: [c.unmatched ? UNMATCHED_NOTE : '', misplacedNote].filter(Boolean).join('\n\n'), items: misplaced });
      $('im-run').hidden = false;
    }
  } catch (err) {
    setStatus('im-status', failure(err, 'Preview failed'));
  } finally {
    buttonEl('im-preview').disabled = false;
  }
}

// ---------- Remove copied comments ----------
// The undo for an import: deletes comments that start with a copy label and were
// posted by whoever owns the token. Other comments are never touched.
let removal: { target: ReadInputs; groups: CopiedGroup[] } | null = null;

function showRemoveConfirm(show: boolean): void {
  $('im-remove-confirm').hidden = !show;
  $('im-remove-start').hidden = show;
}

async function startRemoval(): Promise<void> {
  buttonEl('im-remove-start').disabled = true;
  $('im-run').hidden = true;
  $('im-summary').hidden = true;
  importPlan = null;
  removal = null;
  try {
    const input = readInputs('im');
    setStatus('im-status', 'Finding copied comments…');
    const res = await getComments(input.link, input.token, waitStatus('im-status', 'finding copied comments'));
    const groups = groupCopied(res.comments || []);
    if (!groups.length) {
      setStatus('im-status', { kind: 'info', title: 'Nothing to remove', body: 'This file has no copied comments.' });
      return;
    }
    removal = { target: input, groups };
    const total = groups.reduce((n, g) => n + g.comments.length, 0);
    const who = groups.length === 1
      ? 'They were posted by ' + groups[0].handle + ', and only that person can remove them.'
      : 'They were posted by ' + groups.map((g) => g.handle + ' (' + g.comments.length + ')').join(', ') +
        '. Only the ones you posted will be removed.';
    setStatus('im-status', { kind: 'warning',
      title: groups.length === 1 ? 'Remove ' + total + (total === 1 ? ' copied comment?' : ' copied comments?') : 'Remove your copied comments?',
      body: 'This file has ' + total + (total === 1 ? ' copied comment. ' : ' copied comments. ') + who +
        ' Other comments aren’t touched. This can’t be undone.' });
    $('im-remove-run').textContent = groups.length === 1
      ? 'Remove ' + total + (total === 1 ? ' comment' : ' comments') : 'Remove my copied comments';
    showRemoveConfirm(true);
  } catch (err) {
    setStatus('im-status', failure(err, 'Couldn’t check for copied comments'));
  } finally {
    buttonEl('im-remove-start').disabled = false;
  }
}

function progressBar(): HTMLElement {
  const bar = $('im-bar');
  (bar.firstElementChild as HTMLElement).style.width = '0%';
  bar.setAttribute('aria-valuenow', '0');
  bar.hidden = false;
  return bar;
}

function setProgress(bar: HTMLElement, percent: number): void {
  (bar.firstElementChild as HTMLElement).style.width = percent + '%';
  bar.setAttribute('aria-valuenow', String(percent));
}

async function runRemoval(): Promise<void> {
  const r = removal;
  removal = null;
  showRemoveConfirm(false);
  if (!r) return;
  const link = r.target.link;
  const token = r.target.token;
  const path = '/v1/files/' + link.key + '/comments';
  const onWait = waitStatus('im-status', 'removing');
  let mine: CopiedGroup | null = null;
  let done = 0;
  let threads = 1;
  buttonEl('im-preview').disabled = true;
  buttonEl('im-remove-start').disabled = true;
  lockImportInputs(true);
  const bar = progressBar();
  $('im-status').setAttribute('aria-busy', 'true');

  function tick(): void {
    setProgress(bar, Math.min(100, Math.round(done / threads * 100)));
    setStatus('im-status', 'Removing copied comments… ' + done + ' of ' + threads + ' done. Keep this window open.');
  }
  // Already gone (a reply removed with its thread) counts as removed.
  async function remove(c: FigmaComment): Promise<void> {
    await pace();
    try {
      await api(link.apiHost, token, 'DELETE', path + '/' + encodeURIComponent(c.id), null, onWait);
    } catch (err) {
      if (statusOf(err) !== 404) throw err;
    }
  }
  async function mineLeft(owner: CopiedGroup): Promise<FigmaComment[]> {
    const now = await getComments(link, token, waitStatus('im-status', 'checking the result'));
    const g = groupCopied(now.comments || []).filter((x) => x.userId === owner.userId)[0];
    return g ? g.comments : [];
  }

  try {
    // Figma only lets people delete their own comments, so the first group that
    // allows a delete is the token owner's.
    setStatus('im-status', 'Removing copied comments…');
    for (const group of r.groups) {
      try {
        await remove(group.comments[0]);
        mine = group;
        break;
      } catch (err) {
        if (statusOf(err) !== 403) throw err;
      }
    }
    if (!mine) {
      throw new Error('Figma didn’t let this token remove any of them. Comments can only be removed by the person ' +
        'who posted them, with a token that has the scope file_comments:write.');
    }
    const roots = mine.comments.filter((c) => !c.parent_id);
    threads = Math.max(1, roots.length);
    done = 1;
    tick();
    // Threads first: removing a thread may remove its replies too.
    for (const c of (roots.length ? roots : mine.comments).slice(1)) {
      try { await remove(c); } catch (err) { if (isFatal(err)) throw err; console.warn('Remove ' + c.id + ' failed: ' + messageOf(err)); }
      done++;
      tick();
    }
    // Then any of this person's copied replies that are still there.
    for (const c of await mineLeft(mine)) {
      try { await remove(c); } catch (err) { if (isFatal(err)) throw err; console.warn('Remove ' + c.id + ' failed: ' + messageOf(err)); }
    }
    const remaining = (await mineLeft(mine)).length;
    const removed = mine.comments.length - remaining;
    const others = r.groups.length > 1;
    if (remaining === 0) {
      setStatus('im-status', { kind: 'success', title: 'Copied comments removed',
        body: 'Removed ' + removed + (removed === 1 ? ' copied comment' : ' copied comments') + ' posted by ' + mine.handle + '.' +
          (others ? ' Copied comments posted by other people are still there; they can remove them with their own token.' : '') });
    } else {
      setStatus('im-status', { kind: 'warning', title: 'Some copied comments are still there',
        body: remaining + (remaining === 1 ? ' copied comment' : ' copied comments') + ' couldn’t be removed. ' +
          'Click **Remove copied comments** again to retry.' });
    }
  } catch (err) {
    setStatus('im-status', { kind: 'error', title: 'Removal stopped', body: messageOf(err),
      note: mine ? 'Some comments may already be removed. Click **Remove copied comments** again to continue.' : '' });
  } finally {
    bar.hidden = true;
    $('im-status').removeAttribute('aria-busy');
    buttonEl('im-preview').disabled = false;
    buttonEl('im-remove-start').disabled = false;
    lockImportInputs(false);
  }
}

// Locked while posting, so the posts match what Preview showed.
const IMPORT_INPUTS = ['im-link', 'im-token', 'im-file', 'im-skip-resolved', 'im-skip-deleted'];
function lockImportInputs(locked: boolean): void {
  IMPORT_INPUTS.forEach((id) => { inputEl(id).disabled = locked; });
}

async function runImport(): Promise<void> {
  const plan = importPlan;
  const target = importTarget;
  if (!plan || !target) return;
  const { link, token } = target;
  const path = '/v1/files/' + link.key + '/comments';
  const total = plan.counts.toPost;
  let posted = 0;
  let failed = 0;
  const failedIds: string[] = [];
  const sent: SentComment[] = [];
  buttonEl('im-run').disabled = true;
  buttonEl('im-preview').disabled = true;
  buttonEl('im-remove-start').disabled = true;
  lockImportInputs(true);
  const bar = progressBar();
  // Screen readers announce the result once, not every "Posting N of M"; the progress bar carries progress.
  $('im-status').setAttribute('aria-busy', 'true');

  function tick(): void {
    setProgress(bar, Math.round((posted + failed) / Math.max(total, 1) * 100));
    setStatus('im-status', 'Posting ' + (posted + failed) + ' of ' + total + '… Keep this window open.');
  }
  const onWait = waitStatus('im-status', 'posting');

  // Paced to stay under Figma's rate limit. Keeps what was sent, to compare with what Figma saved.
  async function post(sourceId: string, body: { message: string; client_meta?: ClientMeta; comment_id?: string }): Promise<string> {
    await pace();
    const created = await api<{ id: string }>(link.apiHost, token, 'POST', path, body, onWait);
    sent.push({ id: created.id, sourceId, message: body.message });
    posted++;
    return created.id;
  }

  try {
    for (const t of plan.threads) {
      let rootId = t.existingId;
      if (!rootId) {
        try {
          const body: { message: string; client_meta?: ClientMeta } = { message: t.message };
          if (t.client_meta) body.client_meta = t.client_meta;
          rootId = await post(t.sourceId, body);
        } catch (err) {
          if (isFatal(err)) throw err;
          // Details stay in the plugin console; the window only shows counts.
          console.warn('Thread ' + t.sourceId + ' failed: ' + messageOf(err));
          failedIds.push(t.sourceId);
          t.replies.forEach((r) => { if (!r.existingId) failedIds.push(r.sourceId); });
          failed = failedIds.length;
          tick();
          continue;
        }
        tick();
      }
      for (const r of t.replies) {
        if (r.existingId) continue;
        try {
          await post(r.sourceId, { message: r.message, comment_id: rootId });
        } catch (err) {
          if (isFatal(err)) throw err;
          console.warn('Reply ' + r.sourceId + ' failed: ' + messageOf(err));
          failedIds.push(r.sourceId);
          failed = failedIds.length;
        }
        tick();
      }
    }

    // Figma's list can lag a few seconds behind the posts, so check again before calling anything missing.
    const RECHECK_SECONDS = [5, 10];
    let check: ReturnType<typeof verifyImport>;
    let altered: ReturnType<typeof findAltered>;
    let lost: ReturnType<typeof findAltered>;
    let missing: string[];
    for (let attempt = 0; ; attempt++) {
      setStatus('im-status', 'Checking the result…');
      const after = (await getComments(link, token, waitStatus('im-status', 'checking the result'))).comments || [];
      check = verifyImport(plan, after);
      altered = findAltered(sent, after);
      // Changed so much that even the details don't match: a re-run would post these again.
      lost = altered.filter((a) => !a.recognized);
      // Those are in the file, so they aren't counted as missing.
      const lostIds = new Set(lost.map((a) => a.sourceId));
      missing = check.missing.filter((id) => !lostIds.has(id));
      if (!missing.length || attempt >= RECHECK_SECONDS.length) break;
      setStatus('im-status', 'Not every comment is listed yet; Figma can take a few seconds. Checking again in ' +
        RECHECK_SECONDS[attempt] + ' seconds…');
      await sleep(RECHECK_SECONDS[attempt] * 1000);
    }
    // A post that returned an error but is in the file did go through.
    const missingIds = new Set(missing);
    const recovered = failedIds.filter((id) => !missingIds.has(id)).length;
    const ok = missing.length === 0 && check.misplaced.length === 0;
    // Rows with nothing to report are left out.
    renderSummary('im-summary', [
      ['Posted now', posted + recovered],
      plan.counts.done ? ['Already there before', plan.counts.done] : null,
      missing.length ? ['Missing after check', missing.length] : null,
      check.misplaced.length ? ['Replies under the wrong thread', check.misplaced.length] : null,
    ]);
    // For whoever maintains the plugin: how Figma changed the text. Users get the list below.
    lost.concat(altered.filter((a) => a.recognized)).slice(0, 3).forEach((a) => {
      console.warn('Figma changed comment ' + a.id + (a.recognized ? '' : ' (not recognized)') +
        '.\n--- sent ---\n' + a.sent + '\n--- saved ---\n' + a.saved);
    });
    const s1 = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
    if (lost.length) {
      setStatus('im-status', { kind: 'error', title: 'Don’t run Import again on this file',
        body: 'Figma saved ' + s1(lost.length, 'comment', 'comments') + ' with different text ' +
          'from what the plugin sent, so the plugin can’t recognize ' + (lost.length === 1 ? 'it' : 'them') +
          ' as copied. Running Import again would post ' + (lost.length === 1 ? 'it' : 'them') + ' a second time.',
        note: (lost.length === 1 ? 'The comment is' : 'The comments are') + ' in the file; check that ' +
          (lost.length === 1 ? 'it reads' : 'they read') + ' correctly:',
        items: lost.map((a) => describeCopy(a.sent)) });
    } else if (ok) {
      setStatus('im-status', { kind: 'success', title: 'Import complete',
        body: (plan.counts.roots + plan.counts.replies === 1 ? 'The comment is in this file.'
          : 'All ' + (plan.counts.roots + plan.counts.replies) + ' comments are in this file, and every reply is in the right thread.') });
    } else {
      setStatus('im-status', { kind: 'warning', title: 'Finished with problems',
        body: [
          missing.length ? s1(missing.length, 'comment isn’t', 'comments aren’t') + ' in this file. This is usually a brief ' +
            'network or Figma hiccup. Click **Preview**, then **Post comments** again; comments already copied are skipped.' : '',
          check.misplaced.length ? misplacedHelp(check.misplaced.length) : '',
        ].filter(Boolean).join('\n\n'),
        items: misplacedList(plan, check.misplaced) });
    }
  } catch (err) {
    setStatus('im-status', { kind: 'error', title: 'Import stopped', body: messageOf(err),
      note: posted ? 'Posted ' + posted + ' before stopping. Click **Preview**, then **Post comments** again to continue.' : '' });
  } finally {
    // The plan is used up: what's in the file changed, so a re-run needs a fresh Preview.
    importPlan = null;
    $('im-run').hidden = true;
    bar.hidden = true;
    $('im-status').removeAttribute('aria-busy');
    buttonEl('im-run').disabled = false;
    buttonEl('im-preview').disabled = false;
    buttonEl('im-remove-start').disabled = false;
    lockImportInputs(false);
  }
}

// ---------- Wire up ----------
$('welcome-continue').onclick = () => {
  send({ type: 'save-welcome', hide: inputEl('welcome-hide').checked });
  showWelcome(false);
};
document.querySelectorAll<HTMLElement>('.token-guide').forEach((b) => { b.onclick = () => showWelcome(true); });
$('tab-export').onclick = () => showTab('export');
$('tab-import').onclick = () => showTab('import');
// Arrow keys, Home, and End switch tabs, as in the WAI-ARIA tabs pattern.
$('tabs').addEventListener('keydown', (e: KeyboardEvent) => {
  let next: Tab | undefined = ({ Home: 'export', End: 'import' } as Record<string, Tab>)[e.key];
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') next = currentTab === 'export' ? 'import' : 'export';
  if (!next) return;
  e.preventDefault();
  showTab(next);
  $('tab-' + next).focus();
});
// Post uses what Preview checked, so any later change to these asks for a fresh preview.
IMPORT_INPUTS.forEach((id) => {
  $(id).addEventListener(id === 'im-link' || id === 'im-token' ? 'input' : 'change', () => {
    if (removal) {
      removal = null;
      showRemoveConfirm(false);
      setStatus('im-status', { kind: 'info', body: 'Something changed. Nothing was removed.' });
      return;
    }
    if (!importPlan) return;
    importPlan = null;
    $('im-run').hidden = true;
    $('im-summary').hidden = true;
    setStatus('im-status', { kind: 'info', body: 'Something changed since **Preview**. Click **Preview** again to update the numbers.' });
  });
});
// A banner while offline; every action needs Figma's API.
function showOffline(): void { $('offline').hidden = navigator.onLine; }
window.addEventListener('online', showOffline);
window.addEventListener('offline', showOffline);
showOffline();
$('ex-run').onclick = runExport;
$('ex-again').onclick = () => { if (lastExport) download(lastExport); };
$('im-preview').onclick = runPreview;
$('im-run').onclick = runImport;
$('im-remove-start').onclick = startRemoval;
$('im-remove-run').onclick = runRemoval;
$('im-remove-cancel').onclick = () => {
  removal = null;
  showRemoveConfirm(false);
  setStatus('im-status', { kind: 'info', body: 'Nothing was removed.' });
};
