// Runs the pure functions from ui.html (between BEGIN LOGIC / END LOGIC) in a VM.
// Usage: node --test test/logic.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
const logic = html.slice(html.indexOf('// BEGIN LOGIC'), html.indexOf('// END LOGIC'));
const L = vm.createContext({ Intl, Date, Object, String, Array });
vm.runInContext(logic, L);

const plain = (v) => JSON.parse(JSON.stringify(v));
const user = (handle) => ({ id: handle, handle, img_url: '' });

test('parseFileLink: commercial, gov, branch, and junk', () => {
  assert.deepEqual(
    { ...L.parseFileLink('https://www.figma.com/design/AbCdEfGhIjKlMnOp123456/My-File?node-id=1-2') },
    { apiHost: 'https://api.figma.com', key: 'AbCdEfGhIjKlMnOp123456' });
  assert.deepEqual(
    { ...L.parseFileLink('https://www.figma-gov.com/design/GovKey1234567890abcd/Name') },
    { apiHost: 'https://api.figma-gov.com', key: 'GovKey1234567890abcd' });
  assert.deepEqual(
    { ...L.parseFileLink('figma-gov.com/file/GovKey1234567890abcd') },
    { apiHost: 'https://api.figma-gov.com', key: 'GovKey1234567890abcd' });
  assert.equal(
    L.parseFileLink('https://www.figma.com/design/MainKey1234567890ab/branch/BranchKey123456789/Name').key,
    'BranchKey123456789');
  assert.equal(L.parseFileLink('https://example.com/design/AbCdEfGhIjKlMnOp123456'), null);
  assert.equal(L.parseFileLink(''), null);
});

test('formatTime: Eastern time, readable, DST-independent label', () => {
  assert.equal(L.formatTime('2026-03-14T14:42:00Z'), 'Mar 14, 2026, 10:42:00 AM ET');
  assert.equal(L.formatTime('2026-01-05T00:05:00Z'), 'Jan 4, 2026, 7:05:00 PM ET');
  assert.equal(L.formatTime('2026-10-01T04:00:00Z'), 'Oct 1, 2026, 12:00:00 AM ET');
  // Milliseconds are dropped, not rounded.
  assert.equal(L.formatTime('2026-09-30T19:59:38.835Z'), 'Sep 30, 2026, 3:59:38 PM ET');
  assert.equal(L.formatTime(null), '');
});

test('formatReactions groups by emoji in first-seen order', () => {
  const r = [
    { emoji: ':+1:', user: user('A'), created_at: '' },
    { emoji: ':tada:', user: user('D'), created_at: '' },
    { emoji: ':+1:', user: user('B'), created_at: '' }
  ];
  assert.equal(L.formatReactions(r), ':+1: ×2 (A, B) · :tada: ×1 (D)');
  assert.equal(L.formatReactions([]), '');
});

test('root and reply messages start with a label, then the comment, a rule, and the details', () => {
  const root = {
    id: '111', order_id: '12', user: user('Jane Doe'), created_at: '2026-03-14T14:42:07Z',
    resolved_at: '2026-03-20T20:05:00Z', message: 'Fix the padding', reactions: [{ emoji: ':+1:', user: user('Sam') }]
  };
  assert.equal(L.buildRootMessage(root, null), [
    '[Copied comment]',
    'Fix the padding',
    '———',
    'Jane Doe · Mar 14, 2026, 10:42:07 AM ET',
    '✅ Resolved Mar 20, 2026, 4:05:00 PM ET',
    'Reactions: :+1: ×1 (Sam)'
  ].join('\n'));

  assert.equal(L.buildRootMessage({ ...root, resolved_at: null, reactions: [] }, 'Page 1 › Card'), [
    '[Copied comment]',
    'Fix the padding',
    '———',
    'Jane Doe · Mar 14, 2026, 10:42:07 AM ET',
    'Location: Page 1 › Card (original pin could not be matched)'
  ].join('\n'));

  const reply = L.buildReplyMessage({ id: '222', user: user('Sam'), created_at: '2026-03-15T13:10:00Z', message: 'Done', reactions: [] });
  assert.equal(reply, '[Copied reply]\nDone\n———\nSam · Mar 15, 2026, 9:10:00 AM ET');

  const empty = L.buildReplyMessage({ id: '333', user: null, created_at: '2026-03-15T13:10:00Z', message: '', reactions: [] });
  assert.equal(empty, '[Copied reply]\n———\nunknown · Mar 15, 2026, 9:10:00 AM ET');
});

test('fingerprint ignores the Location line and whitespace drift, and skips ordinary comments', () => {
  const c = { id: '1', user: user('Ann'), created_at: '2026-03-14T14:42:00Z', message: 'Location: keep me', reactions: [] };
  const unmatched = L.buildRootMessage(c, 'Page › Gone');
  const matched = L.buildRootMessage(c, null);
  assert.ok(L.fingerprint(matched));
  assert.equal(L.fingerprint(unmatched), L.fingerprint(matched));
  assert.equal(L.fingerprint(matched.replace(/\n/g, '\r\n') + '  \n'), L.fingerprint(matched));
  // "Location:" in the original text is part of the comment, not the footer.
  assert.notEqual(L.fingerprint(matched), L.fingerprint(L.buildRootMessage({ ...c, message: 'other' }, null)));
  // A root and a reply with the same author, time, and text are different comments.
  assert.notEqual(L.fingerprint(matched), L.fingerprint(L.buildReplyMessage(c)));
  assert.equal(L.fingerprint('A normal comment'), null);
  assert.equal(L.fingerprint('I wrote [Copied comment] in passing'), null);
  assert.equal(L.fingerprint('[Copied comment] typed by hand'), null);
  // The final Location line is dropped even when the original text is empty.
  const bare = { ...c, message: '' };
  assert.equal(L.fingerprint(L.buildRootMessage(bare, 'Page › Gone')), L.fingerprint(L.buildRootMessage(bare, null)));
});

test('transformMeta: all four pin shapes, matched and unmatched', () => {
  const locators = { '1:2': { page: 'Page 1', path: ['Screen', 'Card'], type: 'FRAME', abs: { x: 100, y: 200 } } };
  const out = (m, map) => JSON.parse(JSON.stringify(L.transformMeta(m, map, locators)));

  assert.deepEqual(out({ x: 5, y: 6 }, {}), { meta: { x: 5, y: 6 }, location: null });
  assert.deepEqual(
    out({ x: 5, y: 6, region_width: 10, region_height: 20, comment_pin_corner: 'top-left' }, {}).meta,
    { x: 5, y: 6, region_width: 10, region_height: 20, comment_pin_corner: 'top-left' });
  assert.deepEqual(
    out({ node_id: '1:2', node_offset: { x: 3, y: 4 } }, { '1:2': '9:9' }),
    { meta: { node_id: '9:9', node_offset: { x: 3, y: 4 } }, location: null });
  assert.deepEqual(
    out({ node_id: '1:2', node_offset: { x: 3, y: 4 }, region_width: 7, region_height: 8 }, { '1:2': '1:2' }).meta,
    { node_id: '1:2', node_offset: { x: 3, y: 4 }, region_width: 7, region_height: 8 });
  assert.deepEqual(
    out({ node_id: '1:2', node_offset: { x: 3, y: 4 } }, { '1:2': null }),
    { meta: { x: 103, y: 204 }, location: 'Page 1 › Screen › Card' });
  assert.deepEqual(
    out({ node_id: '5:5', node_offset: { x: 3, y: 4 } }, {}),
    { meta: { x: 3, y: 4 }, location: 'unknown frame' });
  assert.deepEqual(out(undefined, {}), { location: null });
});

function sampleExport() {
  return {
    format: 'comment-porter/1',
    source: { apiHost: 'https://api.figma.com', fileKey: 'SRC', fileName: 'Src' },
    locators: { '1:2': { page: 'P', path: ['F'], type: 'FRAME', abs: { x: 0, y: 0 } } },
    comments: [
      { id: '30', parent_id: '10', user: user('C'), created_at: '2026-01-03T00:00:00Z', message: 'r2', reactions: [] },
      { id: '20', user: user('B'), created_at: '2026-01-02T00:00:00Z', order_id: '2', resolved_at: '2026-01-04T00:00:00Z',
        message: 'second', client_meta: { node_id: '1:2', node_offset: { x: 1, y: 1 } }, reactions: [] },
      { id: '10', user: user('A'), created_at: '2026-01-01T00:00:00Z', order_id: '1', message: 'first',
        client_meta: { x: 1, y: 1 }, reactions: [] },
      { id: '11', parent_id: '10', user: user('B'), created_at: '2026-01-01T12:00:00Z', message: 'r1', reactions: [] },
      { id: '40', parent_id: 'gone', user: user('D'), created_at: '2026-01-05T00:00:00Z', message: 'orphan', reactions: [] }
    ]
  };
}

test('buildPlan orders threads and replies, counts, and skips already-copied comments', () => {
  const data = sampleExport();
  const plan = L.buildPlan(data, [], { '1:2': '1:2' });
  assert.deepEqual(plain(plan.threads.map((t) => t.sourceId)), ['10', '20', '40']);
  assert.deepEqual(plain(plan.threads[0].replies.map((r) => r.sourceId)), ['11', '30']);
  assert.deepEqual({ ...plan.counts }, { roots: 3, replies: 2, done: 0, toPost: 5, resolved: 1, unmatched: 0, skipped: 0, skippedDeleted: 0, misplaced: 0, unrecognized: 0 });

  const existing = [
    { id: 'new10', message: plan.threads[0].message },
    { id: 'new11', parent_id: 'new10', message: plan.threads[0].replies[0].message },
    { id: 'x', message: 'unrelated comment' }
  ];
  const rerun = L.buildPlan(data, existing, { '1:2': null });
  assert.equal(rerun.threads[0].existingId, 'new10');
  assert.equal(rerun.threads[0].replies[0].existingId, 'new11');
  assert.equal(rerun.threads[0].replies[1].existingId, null);
  assert.equal(rerun.counts.done, 2);
  assert.equal(rerun.counts.toPost, 3);
  assert.equal(rerun.counts.unmatched, 1);
});

test('buildPlan counts identical comments separately and survives a fixed frame on rerun', () => {
  const data = sampleExport();
  // A second "+1"-style reply, identical to r1 in author, time, and text, in the same thread.
  data.comments.push({ id: '12', parent_id: '10', user: user('B'), created_at: '2026-01-01T12:00:00Z', message: 'r1', reactions: [] });
  const first = L.buildPlan(data, [], { '1:2': null });
  const t10 = first.threads[0];
  const t20 = first.threads[1];
  assert.deepEqual(plain(t10.replies.map((r) => r.sourceId)), ['11', '12', '30']);
  assert.equal(t10.replies[0].message, t10.replies[1].message);

  // Only one of the two identical replies made it, and thread 20 was posted with a Location line.
  const existing = [
    { id: 'n10', message: t10.message },
    { id: 'n11', parent_id: 'n10', message: t10.replies[0].message },
    { id: 'n20', message: t20.message }
  ];
  const rerun = L.buildPlan(data, existing, { '1:2': '1:2' });
  assert.equal(rerun.threads[1].existingId, 'n20');
  assert.deepEqual(plain(rerun.threads[0].replies.map((r) => r.existingId)), ['n11', null, null]);
  assert.equal(rerun.counts.done, 3);
  assert.equal(rerun.counts.toPost, 3);
});

test('buildPlan can skip resolved threads with their replies', () => {
  const data = sampleExport();
  data.comments.push({ id: '21', parent_id: '20', user: user('A'), created_at: '2026-01-03T00:00:00Z', message: 'ok', reactions: [] });
  const plan = L.buildPlan(data, [], { '1:2': null }, { skipResolved: true });
  assert.deepEqual(plain(plan.threads.map((t) => t.sourceId)), ['10', '40']);
  assert.deepEqual({ ...plan.counts }, { roots: 2, replies: 2, done: 0, toPost: 4, resolved: 0, unmatched: 0, skipped: 2, skippedDeleted: 0, misplaced: 0, unrecognized: 0 });
  // Nothing skipped means the "Done" check doesn't expect the resolved thread either.
  assert.deepEqual(plain(L.verifyImport(plan, plan.threads.flatMap((t, i) =>
    [{ id: 'r' + i, message: t.message }].concat(t.replies.map((r, j) => ({ id: 'r' + i + j, parent_id: 'r' + i, message: r.message })))))),
    { missing: [], misplaced: [] });

  const all = L.buildPlan(data, [], { '1:2': null });
  assert.equal(all.counts.skipped, 0);
  assert.equal(all.counts.resolved, 1);
  assert.equal(all.counts.unmatched, 1);
});

test('buildPlan can skip threads whose frame was deleted before export', () => {
  const data = sampleExport();
  // Thread 50 was pinned to a frame that was already gone at export (null locator), with one reply.
  data.locators['9:9'] = null;
  data.comments.push(
    { id: '50', user: user('E'), created_at: '2026-01-06T00:00:00Z', message: 'old frame', client_meta: { node_id: '9:9', node_offset: { x: 2, y: 2 } }, reactions: [] },
    { id: '51', parent_id: '50', user: user('F'), created_at: '2026-01-06T01:00:00Z', message: 'yes', reactions: [] });

  const kept = L.buildPlan(data, [], { '1:2': '1:2', '9:9': null });
  assert.ok(kept.threads.some((t) => t.sourceId === '50'));
  assert.equal(kept.counts.skippedDeleted, 0);

  const plan = L.buildPlan(data, [], { '1:2': '1:2', '9:9': null }, { skipDeletedFrames: true });
  assert.deepEqual(plain(plan.threads.map((t) => t.sourceId)), ['10', '20', '40']);
  assert.equal(plan.counts.skippedDeleted, 2);
  // A frame that existed at export but isn't found in the target isn't "deleted": thread 20 stays.
  const missingHere = L.buildPlan(data, [], { '1:2': null, '9:9': null }, { skipDeletedFrames: true });
  assert.ok(missingHere.threads.some((t) => t.sourceId === '20'));

  // With both options, a resolved thread on a deleted frame counts once, as resolved.
  data.comments.find((c) => c.id === '50').resolved_at = '2026-01-07T00:00:00Z';
  const both = L.buildPlan(data, [], { '1:2': '1:2', '9:9': null }, { skipResolved: true, skipDeletedFrames: true });
  assert.equal(both.counts.skipped, 3);
  assert.equal(both.counts.skippedDeleted, 0);
});

test('verifyImport finds missing and misplaced copies', () => {
  const plan = L.buildPlan(sampleExport(), [], { '1:2': '1:2' });
  const msg = (id) => {
    for (const t of plan.threads) {
      if (t.sourceId === id) return t.message;
      for (const r of t.replies) if (r.sourceId === id) return r.message;
    }
  };
  const good = [
    { id: 'a', message: msg('10') }, { id: 'b', message: msg('20') }, { id: 'c', message: msg('40') },
    { id: 'd', parent_id: 'a', message: msg('11') }, { id: 'e', parent_id: 'a', message: msg('30') }
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(L.verifyImport(plan, good))), { missing: [], misplaced: [] });

  const bad = good.filter((c) => c.id !== 'b').map((c) => (c.id === 'e' ? { ...c, parent_id: 'c' } : c));
  assert.deepEqual(JSON.parse(JSON.stringify(L.verifyImport(plan, bad))), { missing: ['20'], misplaced: ['30'] });
});

test('verifyImport pairs identical replies with the copy under the right thread', () => {
  const data = sampleExport();
  // Same author, time, and text, but in two different threads.
  data.comments.push({ id: '21', parent_id: '20', user: user('B'), created_at: '2026-01-01T12:00:00Z', message: 'r1', reactions: [] });
  const plan = L.buildPlan(data, [], { '1:2': '1:2' });
  const [t10, t20, t40] = plan.threads;
  const copies = [
    { id: 'a', message: t10.message }, { id: 'b', message: t20.message }, { id: 'c', message: t40.message },
    { id: 'x', parent_id: 'b', message: t20.replies[0].message },
    { id: 'y', parent_id: 'a', message: t10.replies[0].message },
    { id: 'z', parent_id: 'a', message: t10.replies[1].message }
  ];
  assert.deepEqual(plain(L.verifyImport(plan, copies)), { missing: [], misplaced: [] });
});

test('buildPlan counts copied replies that sit under the wrong thread', () => {
  const plan = L.buildPlan(sampleExport(), [], { '1:2': '1:2' });
  const [t10, t20] = plan.threads;
  const existing = [
    { id: 'a', message: t10.message }, { id: 'b', message: t20.message },
    // Reply 30 belongs under thread 10 but was copied under thread 20.
    { id: 'c', parent_id: 'a', message: t10.replies[0].message },
    { id: 'd', parent_id: 'b', message: t10.replies[1].message }
  ];
  const rerun = L.buildPlan(sampleExport(), existing, { '1:2': '1:2' });
  assert.equal(rerun.counts.misplaced, 1);
  assert.deepEqual(plain(rerun.misplaced.map((r) => r.sourceId)), ['30']);
  // It still counts as copied, so it isn't posted again.
  assert.equal(rerun.threads[0].replies[1].existingId, 'd');
});

test('checkOpenFile tells a wrong file apart from frames deleted over time', () => {
  const pin = (id, node, parent) => ({ id, parent_id: parent, client_meta: node ? { node_id: node, node_offset: { x: 0, y: 0 } } : { x: 1, y: 1 } });
  const comments = [pin('1', '1:1'), pin('2', '1:1'), pin('3', '2:2'), pin('4', '3:3'), pin('5', null), pin('6', '3:3', '4')];
  // Two of three frames are gone: that's deleted frames, not the wrong file.
  assert.deepEqual(plain(L.checkOpenFile(comments, { '1:1': { page: 'P' }, '2:2': null, '3:3': null })),
    { wrongFile: false, threadsWithoutFrame: 2 });
  // Nothing found at all: the link and the open file don't match.
  assert.deepEqual(plain(L.checkOpenFile(comments, { '1:1': null, '2:2': null, '3:3': null })),
    { wrongFile: true, threadsWithoutFrame: 4 });
  // No pins on frames: nothing to check.
  assert.deepEqual(plain(L.checkOpenFile([pin('1', null)], {})), { wrongFile: false, threadsWithoutFrame: 0 });
});

test('buildPlan counts copied comments that match nothing in the export', () => {
  const data = sampleExport();
  const plan = L.buildPlan(data, [], { '1:2': '1:2' });
  const existing = [
    { id: 'n10', message: plan.threads[0].message },
    // Same label, but the text differs from anything this export would post.
    { id: 'old', message: '[Copied comment]\nan older version\n———\nA · Jan 1, 2026, 7:00:00 AM ET' },
    { id: 'old2', parent_id: 'old', message: '[Copied reply]\nreply\n———\nB · Jan 1, 2026, 8:00:00 AM ET' },
    { id: 'x', message: 'an ordinary comment' }
  ];
  const rerun = L.buildPlan(data, existing, { '1:2': '1:2' });
  assert.equal(rerun.counts.done, 1);
  assert.equal(rerun.counts.unrecognized, 2);
});

test('findAltered flags posts whose saved text differs from what was sent', () => {
  const sent = [
    { id: 'a', message: '[Copied comment]\nhi :+1:\n———\nA · Jan 1, 2026, 7:00:00 AM ET' },
    { id: 'b', message: '[Copied reply]\nok\n———\nB · Jan 1, 2026, 8:00:00 AM ET' },
    { id: 'c', message: '[Copied reply]\ngone\n———\nB · Jan 1, 2026, 9:00:00 AM ET' }
  ];
  const saved = [
    { id: 'a', message: '[Copied comment]\nhi 👍\n———\nA · Jan 1, 2026, 7:00:00 AM ET' },
    // Trailing whitespace is normalized, so this one still matches.
    { id: 'b', message: '[Copied reply]\nok  \n———\nB · Jan 1, 2026, 8:00:00 AM ET\n' }
  ];
  const altered = plain(L.findAltered(sent, saved));
  assert.deepEqual(altered.map((a) => a.id), ['a']);
  assert.equal(altered[0].saved, saved[0].message);
  // The author-and-time line still matches, so a re-run will recognize it.
  assert.equal(altered[0].recognized, true);

  // If the details line changed too, it can't be recognized.
  const lost = plain(L.findAltered([sent[0]], [{ id: 'a', message: '[Copied comment]\nhi\n———\nA · Jan 1, 2026' }]));
  assert.equal(lost[0].recognized, false);
});

test('buildPlan recognizes copies whose text Figma changed, by author and time', () => {
  const data = sampleExport();
  data.comments.find((c) => c.id === '10').message = 'Hey @Pat Morgan\n\nsecond paragraph';
  const first = L.buildPlan(data, [], { '1:2': '1:2' });
  const t10 = first.threads[0];
  // What Figma might save: the mention rewritten and the blank line collapsed.
  const saved = (m) => m.replace('@Pat Morgan', '@pat.morgan').replace('\n\n', '\n');
  const existing = [
    { id: 'n10', message: saved(t10.message) },
    { id: 'n11', parent_id: 'n10', message: t10.replies[0].message }
  ];
  const rerun = L.buildPlan(data, existing, { '1:2': '1:2' });
  assert.equal(rerun.threads[0].existingId, 'n10');
  assert.equal(rerun.threads[0].replies[0].existingId, 'n11');
  assert.equal(rerun.counts.unrecognized, 0);
  assert.deepEqual(plain(L.verifyImport(first, existing.concat(
    rerun.threads.slice(1).map((t, i) => ({ id: 'x' + i, message: t.message })),
    [{ id: 'y', parent_id: 'n10', message: t10.replies[1].message }]))), { missing: [], misplaced: [] });
});

test('exact text decides between two comments by one person in the same second', () => {
  const data = sampleExport();
  // A second thread by the same author in the same second as thread 10, with different text.
  data.comments.push({ id: '15', user: user('A'), created_at: '2026-01-01T00:00:00.500Z', message: 'other', client_meta: { x: 0, y: 0 }, reactions: [] });
  const plan = L.buildPlan(data, [], { '1:2': '1:2' });
  const t15 = plan.threads.find((t) => t.sourceId === '15');
  const t10 = plan.threads.find((t) => t.sourceId === '10');
  assert.equal(L.detailsKey(t15.message), L.detailsKey(t10.message));
  // Only thread 15's copy exists: it must not be claimed by thread 10.
  const rerun = L.buildPlan(data, [{ id: 'c15', message: t15.message }], { '1:2': '1:2' });
  assert.equal(rerun.threads.find((t) => t.sourceId === '15').existingId, 'c15');
  assert.equal(rerun.threads.find((t) => t.sourceId === '10').existingId, null);
});

test('formatWait picks a readable unit', () => {
  assert.equal(L.formatWait(1), '1 second');
  assert.equal(L.formatWait(45), '45 seconds');
  assert.equal(L.formatWait(180), '3 minutes');
  assert.equal(L.formatWait(7200), '2 hours');
  assert.equal(L.formatWait(3 * 86400), '3 days');
});

test('safeFileName strips path characters', () => {
  assert.equal(L.safeFileName('Design: Forms / v2'), 'Design- Forms - v2 - comments.json');
  assert.equal(L.safeFileName(''), 'figma-file - comments.json');
});
