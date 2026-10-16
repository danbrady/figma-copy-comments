// Every screen and message in the plugin, reached by driving the real UI. Each scenario
// sets up the fake Figma, clicks through the plugin, and calls h.shot() at each state to
// record. scripts/visual-qa/run.mjs runs every scenario once per theme.
import { ME } from './fake-figma.mjs';

// ---------- Made-up files and comments ----------
const SRC = 'SRCk3J9xQr7Lm2Vn8Pd4Ty';
const DST = 'DSTp7wM2rCk5Hx9Zb3Nq6J';
const SRC_LINK = 'https://www.figma.com/design/' + SRC + '/Checkout-redesign';
const DST_LINK = 'https://www.figma.com/design/' + DST + '/Checkout-redesign-copy';
const TOKEN = 'figd_demo_token_value';
const FILE_NAME = 'Checkout redesign';

const user = (handle) => ({ id: 'u-' + handle.replace(/\W/g, ''), handle, img_url: '' });
const ALEX = user('alex.rivera');
const BEA = user('b.ortiz');
const CHRIS = user('c.kim');
const DANA = user('d.lee');
const SAM = { id: 'u-sam', handle: 'Sam Okafor', img_url: '' };
const at = (day, hour, min = 0) => new Date(Date.UTC(2026, 9, day, hour, min, 14)).toISOString();
const pin = (node, x = 24, y = 40) => ({ node_id: node, node_offset: { x, y } });

// Layers in the original file. 9:99 was deleted before export.
const LOC = {
  '1:10': { page: 'Checkout', path: ['Payment'], type: 'FRAME', abs: { x: 0, y: 0 } },
  '1:11': { page: 'Checkout', path: ['Payment', 'Error state'], type: 'FRAME', abs: { x: 480, y: 0 } },
  '1:12': { page: 'Checkout', path: ['Confirmation'], type: 'FRAME', abs: { x: 960, y: 0 } },
};
const SRC_NODES = LOC;

const COMMENTS = [
  { id: 'c1', user: ALEX, created_at: at(1, 13, 52), resolved_at: at(1, 17, 20), client_meta: pin('1:10'),
    message: 'Can we bump the button contrast? It fails AA on hover.',
    reactions: [{ emoji: ':+1:', user: BEA }, { emoji: ':+1:', user: CHRIS }, { emoji: ':+1:', user: DANA }] },
  { id: 'c2', parent_id: 'c1', user: BEA, created_at: at(1, 17, 19), message: 'Darkened it to #0b5cad. Passes now.' },
  { id: 'c3', parent_id: 'c1', user: ALEX, created_at: at(1, 17, 21), message: '@Bea Ortiz thanks!' },
  { id: 'c4', user: CHRIS, created_at: at(2, 15, 5), client_meta: pin('1:11', 12, 88),
    message: 'Should this error message say what to do next?' },
  { id: 'c5', parent_id: 'c4', user: DANA, created_at: at(2, 15, 40), message: 'Agreed. @Chris Kim can you draft the copy?' },
  { id: 'c6', user: DANA, created_at: at(3, 14, 0), client_meta: { x: 1600, y: 220 },
    message: 'Parking lot: revisit the empty state after research.' },
  { id: 'c7', user: BEA, created_at: at(4, 18, 30), client_meta: pin('9:99'), message: 'Old header idea, ignore.' },
  { id: 'c8', user: ALEX, created_at: at(6, 13, 15), client_meta: pin('1:12', 200, 140),
    message: 'Love this confirmation screen.' },
].map((c) => ({ parent_id: null, resolved_at: null, reactions: [], client_meta: null, ...c }));

function exportFile(comments = COMMENTS, extra = {}) {
  return {
    format: 'comment-porter/1',
    exported_at: '2026-10-16T13:00:00.000Z',
    source: { apiHost: 'https://api.figma.com', fileKey: SRC, fileName: FILE_NAME },
    comments,
    locators: { ...LOC, '9:99': null },
    ...extra,
  };
}

// A copied comment as the plugin would have posted it, for files that already have copies.
// The details line is from no comment in COMMENTS, so these never match the export file.
const copied = (id, by, text, parent) => ({
  id, user: by, created_at: at(10, 12), parent_id: parent || null,
  message: (parent ? '[Copied reply]\n' : '[Copied comment]\n') + text + '\n———\nm.santos · Mar 3, 2026, 8:00:00 AM ET',
});

// ---------- Steps shared by scenarios ----------
async function exportWith(h, { link = SRC_LINK, token = TOKEN } = {}) {
  await h.init({ nodes: SRC_NODES });
  if (link) await h.fill('#ex-link', link);
  if (token) await h.fill('#ex-token', token);
}

async function importWith(h, { file = exportFile(), nodes = SRC_NODES, link = DST_LINK, token = TOKEN } = {}) {
  await h.init({ nodes, fileName: FILE_NAME + ' (copy)' });
  await h.tab('import');
  if (link) await h.fill('#im-link', link);
  if (token) await h.fill('#im-token', token);
  if (file) await h.chooseFile(typeof file === 'string' ? file : JSON.stringify(file));
}

async function preview(h) {
  await h.click('#im-preview');
  await h.settle('im');
}

async function post(h) {
  await h.click('#im-run');
  await h.settle('im');
}

const SETUP = 'Setup';
const EXPORT = 'Export';
const EXPORT_ERRORS = 'Export: problems';
const PREVIEW = 'Import: Preview';
const PREVIEW_ERRORS = 'Import: Preview problems';
const POSTING = 'Import: posting';
const RESULTS = 'Import: results';
const REMOVE = 'Remove copied comments';
const CONNECTION = 'Connection and rate limits';

export const GROUPS = [SETUP, EXPORT, EXPORT_ERRORS, PREVIEW, PREVIEW_ERRORS, POSTING, RESULTS, REMOVE, CONNECTION];

// Messages that never show in the plugin window, listed in the report as text only.
export const TEXT_ONLY = [
  { group: PREVIEW_ERRORS, id: 'import-unreadable', name: 'File can’t be read', kind: 'Error: Preview failed',
    when: 'The browser couldn’t read the chosen .json file, for example because it was moved or deleted after it was chosen. Shown in the plugin like the other Preview problems; the screens can’t make a browser fail this way, so there’s no screenshot.',
    text: 'Could not read that file.' },
  { group: CONNECTION, id: 'figma-toast', name: 'Error toast in Figma',
    when: 'The main thread fails to handle a message that has no request to answer (saving the setup-screen setting, or resizing the window). Shown by Figma as a toast at the bottom of the canvas, not in the plugin window. Not expected in normal use.',
    kind: 'Figma toast', text: 'Copy Comments error: <the error’s message>' },
];

export const SCENARIOS = [
  // ---------- Setup ----------
  { name: 'setup screen', run: async (h) => {
    await h.init({ welcomeHidden: false });
    await h.shot(SETUP, 'setup', 'Setup screen', 'The first time someone opens the plugin, and whenever they click **Token setup guide**.');
  } },

  // ---------- Export ----------
  { name: 'export empty', run: async (h) => {
    await h.init({});
    await h.shot(EXPORT, 'export-empty', 'Export tab', 'After the setup screen, or when the plugin opens with the setup screen turned off.');
  } },
  { name: 'export progress', run: async (h) => {
    await exportWith(h);
    h.fake.hooks.hold = (c) => c.method === 'GET';
    await h.click('#ex-run');
    await h.parked();
    await h.shot(EXPORT, 'export-reading', 'Reading comments', 'While the plugin downloads the comments from Figma.');
    h.fake.hooks.hold = null;
    await h.bridgeHold('locate');
    h.fake.release();
    await h.bridgeParked();
    await h.shot(EXPORT, 'export-recording', 'Recording pins', 'While the plugin looks up the frames comments are pinned to, in the open file.');
    await h.bridgeRelease();
    await h.settle('ex');
  } },
  { name: 'export complete', run: async (h) => {
    h.fake.seed(SRC, COMMENTS);
    await exportWith(h);
    await h.click('#ex-run');
    await h.settle('ex');
    await h.shot(EXPORT, 'export-complete', 'Export complete', 'The comments were saved to a .json file. The note only appears when some threads are pinned to frames that were deleted.');
  } },
  { name: 'export wrong file', run: async (h) => {
    h.fake.seed(SRC, COMMENTS);
    await exportWith(h);
    await h.setNodes({});
    await h.click('#ex-run');
    await h.settle('ex');
    await h.shot(EXPORT, 'export-check-link', 'Check the link (Export)', 'None of the frames the comments are pinned to are in the open file, so the link is probably for a different file. The export still downloads.');
  } },
  { name: 'export missing link', run: async (h) => {
    await exportWith(h, { link: '', token: '' });
    await h.click('#ex-run');
    await h.settle('ex');
    await h.shot(EXPORT_ERRORS, 'export-no-link', 'No link', '**Export comments** was clicked without a valid file link.');
  } },
  { name: 'export missing token', run: async (h) => {
    await exportWith(h, { token: '' });
    await h.click('#ex-run');
    await h.settle('ex');
    await h.shot(EXPORT_ERRORS, 'export-no-token', 'No token', '**Export comments** was clicked without a token.');
  } },
  ...[
    [401, 'export-401', 'Token not accepted (401)', 'Figma didn’t recognize the token: it was mistyped, cut short when pasting, expired, or deleted.', { status: 401, body: { status: 401, err: 'Invalid token' } }],
    [400, 'export-400', 'Request rejected (400)', 'Figma rejected the request as malformed. Shows Figma’s own reason. Not expected in normal use.', { status: 400, body: { status: 400, err: 'Invalid file key' } }],
    [403, 'export-403', 'Not allowed (403)', 'The token can’t open the file, has expired, or is missing the scope.', { status: 403, body: { status: 403, err: 'Forbidden' } }],
    [404, 'export-404', 'File not found (404)', 'The link’s file doesn’t exist, or the token’s account can’t see it.', { status: 404, body: { status: 404, err: 'Not found' } }],
    [500, 'export-500', 'Figma error (500)', 'Figma’s API had a problem. Any status without its own wording (all but 400, 401, 403, and 404) uses this one, with Figma’s own message.', { status: 500, body: { status: 500, err: 'Internal server error' } }],
  ].map(([code, id, name, when, response]) => ({ name: 'export ' + code, run: async (h) => {
    h.fake.hooks.respond = () => response;
    await exportWith(h);
    await h.click('#ex-run');
    await h.settle('ex');
    await h.shot(EXPORT_ERRORS, id, name, when);
  } })),

  // ---------- Import: Preview ----------
  { name: 'import empty', run: async (h) => {
    await importWith(h, { file: null, link: '', token: '' });
    await h.shot(PREVIEW, 'import-empty', 'Import tab', 'Before anything is filled in.');
  } },
  { name: 'import progress', run: async (h) => {
    await importWith(h);
    h.fake.hooks.hold = (c) => c.method === 'GET';
    await h.click('#im-preview');
    await h.parked();
    await h.shot(PREVIEW, 'import-checking', 'Checking existing comments', 'While Preview reads the comments already in the file, to skip ones that were already copied.');
    h.fake.hooks.hold = null;
    await h.bridgeHold('resolve');
    h.fake.release();
    await h.bridgeParked();
    await h.shot(PREVIEW, 'import-matching', 'Matching frames', 'While Preview finds the frames comments are pinned to, in the open file.');
    await h.bridgeRelease();
    await h.settle('im');
  } },
  { name: 'import ready', run: async (h) => {
    await importWith(h);
    await preview(h);
    await h.shot(PREVIEW, 'import-ready', 'Ready to post', 'Preview found comments to post. The sentence about @mentions only appears when some do.');
    await h.check('#im-skip-resolved');
    await h.shot(PREVIEW, 'import-changed', 'Something changed', 'An input changed after Preview, so the numbers may be out of date.');
  } },
  { name: 'import ready unmatched', run: async (h) => {
    const nodes = { ...SRC_NODES };
    delete nodes['1:12'];
    await importWith(h, { nodes });
    await preview(h);
    await h.shot(PREVIEW, 'import-ready-unmatched', 'Ready to post, with pins that don’t match', 'Some frames aren’t in the open file, so those comments go near their old spot.');
  } },
  { name: 'import nothing to post', run: async (h) => {
    await importWith(h, { file: exportFile(COMMENTS.filter((c) => c.id === 'c1' || c.parent_id === 'c1')) });
    await h.check('#im-skip-resolved');
    await preview(h);
    await h.shot(PREVIEW, 'import-nothing', 'Nothing to post', 'The skip options leave out every thread.');
  } },
  { name: 'import up to date', run: async (h) => {
    await importWith(h);
    await preview(h);
    await post(h);
    await preview(h);
    await h.shot(PREVIEW, 'import-up-to-date', 'Already up to date', 'Every comment was already copied to this file.');
  } },
  { name: 'import unrecognized', run: async (h) => {
    h.fake.seed(DST, [copied('900', ME, 'A comment from some other export')]);
    await importWith(h);
    await preview(h);
    await h.shot(PREVIEW, 'import-check-before', 'Check before posting', 'The file has copied comments that don’t match this export file, so posting might duplicate them.');
  } },
  { name: 'import misplaced', run: async (h) => {
    await importWith(h);
    await preview(h);
    // Figma files reply c5 under the first thread's copy instead of its own.
    let firstRoot = null;
    h.fake.hooks.parent = (commentId, body) => {
      firstRoot = firstRoot || commentId;
      return body.message.includes('draft the copy') ? firstRoot : commentId;
    };
    await post(h);
    await h.shot(RESULTS, 'import-finished-misplaced', 'Finished with problems: wrong thread', 'After posting, a reply is under the wrong thread. The list says which.');
    h.fake.hooks.parent = null;
    await preview(h);
    await h.shot(PREVIEW, 'import-misplaced', 'Some replies are in the wrong thread', 'Everything is copied, but a reply is under the wrong thread.');
  } },
  { name: 'import no file', run: async (h) => {
    await importWith(h, { file: null });
    await preview(h);
    await h.shot(PREVIEW_ERRORS, 'import-no-file', 'No export file', '**Preview** was clicked before choosing the .json file.');
  } },
  { name: 'import bad json', run: async (h) => {
    await importWith(h, { file: '{ not json' });
    await preview(h);
    await h.shot(PREVIEW_ERRORS, 'import-not-json', 'Not a JSON file', 'The chosen file isn’t valid JSON.');
  } },
  { name: 'import wrong format', run: async (h) => {
    await importWith(h, { file: { hello: 'world' } });
    await preview(h);
    await h.shot(PREVIEW_ERRORS, 'import-not-export', 'Not an export file', 'The chosen file is JSON, but not one Export made.');
  } },
  { name: 'import same file', run: async (h) => {
    await importWith(h, { link: SRC_LINK });
    await preview(h);
    await h.shot(PREVIEW_ERRORS, 'import-same-file', 'Same file', 'The link is for the file the comments came from.');
  } },
  { name: 'import wrong file', run: async (h) => {
    h.fake.seed(DST, [{ id: '901', user: SAM, created_at: at(9, 12), message: 'Nice', client_meta: pin('42:1') }]);
    await importWith(h);
    await preview(h);
    await h.shot(PREVIEW_ERRORS, 'import-check-link', 'Check the link (Import)', 'The linked file has comments on frames that aren’t in the open file, so the link is probably for a different file.');
  } },
  { name: 'import 403', run: async (h) => {
    h.fake.hooks.respond = () => ({ status: 403, body: { status: 403, err: 'Forbidden' } });
    await importWith(h);
    await preview(h);
    await h.shot(PREVIEW_ERRORS, 'import-preview-failed', 'Preview failed', 'Figma refused the request. Any API error during Preview uses this title, with the matching wording from Export’s errors.');
  } },

  // ---------- Import: posting ----------
  { name: 'posting', run: async (h) => {
    await importWith(h);
    await preview(h);
    h.fake.hooks.hold = (c) => c.method === 'POST' && c.n === 4;
    await h.click('#im-run');
    await h.parked();
    await h.shot(POSTING, 'import-posting', 'Posting', 'While comments are posted, about 40 a minute.');
    h.fake.hooks.hold = (c) => c.method === 'GET';
    h.fake.release();
    await h.parked();
    await h.shot(POSTING, 'import-checking-result', 'Checking the result', 'After posting, while the plugin checks that every comment arrived.');
    h.fake.hooks.hold = null;
    h.fake.release();
    await h.settle('im');
    await h.shot(RESULTS, 'import-complete', 'Import complete', 'Every comment is in the file, and every reply is in the right thread.');
  } },
  { name: 'posting stopped', run: async (h) => {
    await importWith(h);
    await preview(h);
    h.fake.hooks.respond = (c) => (c.method === 'POST' && c.n === 3 ? { status: 403, body: { status: 403, err: 'Forbidden' } } : undefined);
    await post(h);
    await h.shot(RESULTS, 'import-stopped', 'Import stopped', 'A problem stopped posting partway, such as the token losing access. The note only appears if some were posted.');
  } },
  { name: 'posting missing', run: async (h) => {
    await importWith(h);
    await preview(h);
    h.fake.hooks.drop = (body) => body.message.includes('Parking lot');
    await h.click('#im-run');
    await h.waitText('#im-status', 'Checking again');
    await h.shot(POSTING, 'import-recheck', 'Checking again', 'After posting, a comment isn’t listed yet. Figma can take a few seconds, so the plugin checks again twice.');
    await h.settle('im');
    await h.shot(RESULTS, 'import-finished-missing', 'Finished with problems: missing', 'After checking three times, some comments aren’t in the file.');
  } },
  { name: 'posting altered', run: async (h) => {
    await importWith(h);
    await preview(h);
    // Figma rewrote this comment, down to the author-and-time line.
    h.fake.hooks.save = (message) => (message.includes('empty state') ? message.replace(/d\.lee · .*/, 'd.lee') : message);
    await post(h);
    await h.shot(RESULTS, 'import-dont-run-again', 'Don’t run Import again', 'Figma saved some comments with different text, so a re-run can’t recognize them and would post them twice.');
  } },
  { name: 'posting one', run: async (h) => {
    await importWith(h, { file: exportFile([COMMENTS[5]]) });
    await preview(h);
    await post(h);
    await h.shot(RESULTS, 'import-complete-one', 'Import complete (one comment)', 'The same message when only one comment was posted.');
  } },

  // ---------- Remove copied comments ----------
  { name: 'remove finding', run: async (h) => {
    h.fake.seed(DST, [copied('910', ME, 'Copied one'), copied('911', ME, 'Copied reply', '910')]);
    await importWith(h, { file: null });
    h.fake.hooks.hold = (c) => c.method === 'GET';
    await h.click('#im-remove-start');
    await h.parked();
    await h.shot(REMOVE, 'remove-finding', 'Finding copied comments', 'After clicking **Remove copied comments from this file…**, while the plugin looks for them.');
    h.fake.hooks.hold = null;
    h.fake.release();
    await h.settle('im', '#im-remove-start');
    await h.shot(REMOVE, 'remove-confirm', 'Remove copied comments?', 'The confirm step, when the copies were all posted by one person. Nothing is removed yet.');
    await h.click('#im-remove-cancel');
    await h.shot(REMOVE, 'remove-cancelled', 'Cancelled', 'After clicking **Cancel** on the confirm step.');
    await h.click('#im-remove-start');
    await h.settle('im', '#im-remove-start');
    await h.fill('#im-link', DST_LINK + '?x');
    await h.shot(REMOVE, 'remove-changed', 'Something changed (Remove)', 'An input changed while the confirm step was showing.');
  } },
  { name: 'remove many posters', run: async (h) => {
    h.fake.seed(DST, [
      copied('920', ME, 'Mine 1'), copied('921', ME, 'Mine reply', '920'), copied('922', ME, 'Mine 2'),
      copied('930', SAM, 'Sam 1'), copied('931', SAM, 'Sam 2'),
    ]);
    await importWith(h, { file: null });
    await h.click('#im-remove-start');
    await h.settle('im', '#im-remove-start');
    await h.shot(REMOVE, 'remove-confirm-many', 'Remove your copied comments?', 'The confirm step, when more than one person posted copies. Only the token owner’s are removed.');
    h.fake.hooks.hold = (c) => c.method === 'DELETE' && c.n === 2;
    await h.click('#im-remove-run');
    await h.parked();
    await h.shot(REMOVE, 'remove-progress', 'Removing', 'While copied comments are removed.');
    h.fake.hooks.hold = null;
    h.fake.release();
    await h.settle('im', '#im-remove-start');
    await h.shot(REMOVE, 'remove-done', 'Copied comments removed', 'Every copy posted by the token’s owner is gone. The last sentence only appears when someone else’s copies are left.');
  } },
  { name: 'remove nothing', run: async (h) => {
    h.fake.seed(DST, [{ id: '940', user: SAM, created_at: at(9, 12), message: 'A regular comment' }]);
    await importWith(h, { file: null });
    await h.click('#im-remove-start');
    await h.settle('im', '#im-remove-start');
    await h.shot(REMOVE, 'remove-nothing', 'Nothing to remove', 'The file has no copied comments.');
  } },
  { name: 'remove some left', run: async (h) => {
    h.fake.seed(DST, [copied('950', ME, 'One'), copied('951', ME, 'Two'), copied('952', ME, 'Three')]);
    h.fake.hooks.respond = (c) => (c.method === 'DELETE' && c.id === '952' ? { status: 500, body: { status: 500, err: 'Internal server error' } } : undefined);
    await importWith(h, { file: null });
    await h.click('#im-remove-start');
    await h.settle('im', '#im-remove-start');
    await h.click('#im-remove-run');
    await h.settle('im', '#im-remove-start');
    await h.shot(REMOVE, 'remove-some-left', 'Some copied comments are still there', 'Figma wouldn’t remove some of them, even after a second try.');
  } },
  { name: 'remove not allowed', run: async (h) => {
    h.fake.seed(DST, [copied('960', SAM, 'Sam 1'), copied('961', SAM, 'Sam 2')]);
    await importWith(h, { file: null });
    await h.click('#im-remove-start');
    await h.settle('im', '#im-remove-start');
    await h.shot(REMOVE, 'remove-confirm-others', 'Remove copied comments? (someone else’s)', 'The confirm step, when all the copies were posted by someone else.');
    await h.click('#im-remove-run');
    await h.settle('im', '#im-remove-start');
    await h.shot(REMOVE, 'remove-stopped', 'Removal stopped', 'Figma wouldn’t let the token remove any of them: only the person who posted a comment can remove it. Other problems partway through use the same title, with a note that some may already be removed.');
  } },
  { name: 'remove check failed', run: async (h) => {
    h.fake.hooks.respond = () => ({ status: 404, body: { status: 404, err: 'Not found' } });
    await importWith(h, { file: null });
    await h.click('#im-remove-start');
    await h.settle('im', '#im-remove-start');
    await h.shot(REMOVE, 'remove-check-failed', 'Couldn’t check for copied comments', 'An API error while looking for copies.');
  } },

  // ---------- Connection and rate limits ----------
  { name: 'offline', run: async (h) => {
    await exportWith(h);
    await h.offline(true);
    await h.click('#ex-run');
    await h.settle('ex');
    await h.shot(CONNECTION, 'offline', 'Offline', 'The computer is offline: a banner at the top, and any step stops with this message. The banner goes away when the connection returns.');
  } },
  { name: 'unreachable', run: async (h) => {
    h.fake.hooks.respond = () => 'abort';
    await exportWith(h);
    await h.click('#ex-run');
    await h.settle('ex');
    await h.shot(CONNECTION, 'unreachable', 'Could not reach Figma', 'Online, but the request failed, for example because a network blocks Figma’s API.');
  } },
  { name: 'rate limit wait', run: async (h) => {
    h.fake.hooks.respond = (c) => (c.n === 1 ? { status: 429 } : undefined);
    await exportWith(h);
    await h.click('#ex-run');
    await h.waitText('#ex-status', 'limiting');
    await h.shot(CONNECTION, 'rate-wait', 'Waiting on a rate limit', 'Figma asked the plugin to slow down. The plugin waits, then carries on. During Import and Remove the last words say “then posting”, “then removing”, and so on.');
    await h.settle('ex');
  } },
  { name: 'rate limit too long', run: async (h) => {
    h.fake.hooks.respond = () => ({ status: 429, headers: { 'retry-after': '600', 'access-control-expose-headers': 'Retry-After' } });
    await exportWith(h);
    await h.click('#ex-run');
    await h.settle('ex');
    await h.shot(CONNECTION, 'rate-too-long', 'Rate limit too long', 'Figma asked the account to wait more than 5 minutes.');
  } },
  { name: 'rate limit gave up', run: async (h) => {
    h.fake.hooks.respond = () => ({ status: 429 });
    await exportWith(h);
    await h.click('#ex-run');
    await h.settle('ex');
    await h.shot(CONNECTION, 'rate-gave-up', 'Rate limited, gave up', 'Figma kept limiting requests after six waits (about 5 minutes in all).');
  } },
];
