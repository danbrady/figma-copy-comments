// Pure functions: no DOM or network. Unit-tested by test/logic.test.js.
import type { ApiHost, ClientMeta, ExportFile, FigmaComment, Locators, Reaction } from './types';

export const COMMERCIAL_API: ApiHost = 'https://api.figma.com';
export const GOV_API: ApiHost = 'https://api.figma-gov.com';
// Export files say which format they're in. Kept as is so earlier exports still load.
export const FORMAT = 'comment-porter/1';

export function envLabel(apiHost: string): string {
  return apiHost === GOV_API ? 'Figma for Government' : 'commercial Figma';
}

export interface FileLink {
  apiHost: ApiHost;
  key: string;
}

// Accepts figma.com and figma-gov.com design/file/proto links, including branch links.
export function parseFileLink(input: unknown): FileLink | null {
  const s = String(input || '').trim();
  const m = s.match(/(?:^|\/\/|\.)(figma(?:-gov)?\.com)\/(?:design|file|proto|board|slides)\/([A-Za-z0-9]{10,})/);
  if (!m) return null;
  const branch = s.match(/\/branch\/([A-Za-z0-9]{10,})/);
  return {
    apiHost: m[1] === 'figma-gov.com' ? GOV_API : COMMERCIAL_API,
    key: branch ? branch[1] : m[2],
  };
}

// "Mar 14, 2026, 10:42:07 AM ET" — Eastern time, with the raw UTC kept in the export file.
// Seconds keep the author-and-time line unique, which matching relies on when Figma rewrites text.
// Built from parts so newer ICU's narrow no-break space before AM/PM never leaks in.
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).formatToParts(new Date(iso)).forEach((p) => { parts[p.type] = p.value; });
  return parts.month + ' ' + parts.day + ', ' + parts.year + ', ' +
    parts.hour + ':' + parts.minute + ':' + parts.second + ' ' + parts.dayPeriod + ' ET';
}

// ":+1: ×3 (A, B, C) · :tada: ×1 (D)" — grouped by emoji, in first-seen order.
export function formatReactions(reactions: Reaction[] | null | undefined): string {
  if (!reactions || !reactions.length) return '';
  const order: string[] = [];
  const byEmoji: Record<string, string[]> = {};
  reactions.forEach((r) => {
    if (!byEmoji[r.emoji]) { byEmoji[r.emoji] = []; order.push(r.emoji); }
    byEmoji[r.emoji].push(r.user && r.user.handle || 'unknown');
  });
  return order.map((e) => e + ' ×' + byEmoji[e].length + ' (' + byEmoji[e].join(', ') + ')').join(' · ');
}

const DIVIDER = '———';
const MARKERS: Record<string, true> = { '[Copied comment]': true, '[Copied reply]': true };

// A label, the original text, a rule, then the details: author and time,
// resolved time, reactions, and (last, when the pin didn't match) the old location.
function buildMessage(c: FigmaComment, marker: string, extra: string[]): string[] {
  const lines = [marker].concat(c.message ? [c.message] : [], DIVIDER,
    (c.user && c.user.handle || 'unknown') + ' · ' + formatTime(c.created_at), extra);
  const reactions = formatReactions(c.reactions);
  if (reactions) lines.push('Reactions: ' + reactions);
  return lines;
}

export function buildRootMessage(c: FigmaComment, location: string | null): string {
  const lines = buildMessage(c, '[Copied comment]', c.resolved_at ? ['✅ Resolved ' + formatTime(c.resolved_at)] : []);
  if (location) lines.push('Location: ' + location + ' (original pin could not be matched)');
  return lines.join('\n');
}

export function buildReplyMessage(c: FigmaComment): string {
  return buildMessage(c, '[Copied reply]', []).join('\n');
}

// Identifies a copied comment by everything the plugin wrote into it except the
// final Location line, which changes if frames are fixed between runs.
// Comments that don't start with a copy label get null.
export function fingerprint(message: string | null | undefined): string | null {
  const lines = String(message || '').replace(/\r\n?/g, '\n').trim().split('\n')
    .map((l) => l.replace(/\s+$/, ''));
  if (!MARKERS[lines[0]]) return null;
  if (lines.length > 2 && lines[lines.length - 1].indexOf('Location: ') === 0) lines.pop();
  return lines.join('\n');
}

// A looser identity for when Figma changed the comment text on save (it rewrites
// @mentions and blank lines, for example): the label plus the author-and-time line,
// which is the first line after the last divider. Null if the comment isn't labeled.
export function detailsKey(message: string | null | undefined): string | null {
  const f = fingerprint(message);
  if (!f) return null;
  const lines = f.split('\n');
  const d = lines.lastIndexOf(DIVIDER);
  return d > 0 && d + 1 < lines.length ? lines[0] + '\n' + lines[d + 1] : null;
}

// The parts of a planned thread that matching needs.
interface Matchable {
  sourceId: string;
  message: string;
  replies: { sourceId: string; message: string }[];
}

type Copies = Record<string, FigmaComment | null>;

// Pair each planned comment with at most one existing copy. Identical comments pair
// one-to-one, so two identical "+1" replies need two copies. Exact text is tried before
// the details alone, so it decides between look-alikes, such as two comments by one
// person in the same second. Replies take a copy under their thread's copy first.
export function matchCopies(threads: Matchable[], comments: FigmaComment[] | null | undefined): Copies {
  const keys = { exact: fingerprint, details: detailsKey };
  type Kind = keyof typeof keys;
  const pools: Record<Kind, Record<string, FigmaComment[]>> = { exact: {}, details: {} };
  (comments || []).forEach((c) => {
    (['exact', 'details'] as Kind[]).forEach((kind) => {
      const k = keys[kind](c.message);
      if (k) (pools[kind][k] = pools[kind][k] || []).push(c);
    });
  });
  const used: Record<string, true> = {};
  function take(kind: Kind, message: string, accept: (c: FigmaComment) => boolean): FigmaComment | null {
    const list = pools[kind][keys[kind](message) as string] || [];
    for (const c of list) {
      if (!used[c.id] && accept(c)) { used[c.id] = true; return c; }
    }
    return null;
  }
  const any = () => true;
  const isRoot = (c: FigmaComment) => !c.parent_id;
  const copies: Copies = {};
  ([['exact', isRoot], ['exact', any], ['details', isRoot], ['details', any]] as const).forEach(([kind, accept]) => {
    threads.forEach((t) => {
      if (!copies[t.sourceId]) copies[t.sourceId] = take(kind, t.message, accept);
    });
  });
  ([['exact', true], ['details', true], ['exact', false], ['details', false]] as const).forEach(([kind, underRoot]) => {
    threads.forEach((t) => {
      const root = copies[t.sourceId];
      t.replies.forEach((r) => {
        if (copies[r.sourceId]) return;
        copies[r.sourceId] = take(kind, r.message, (c) => !underRoot || (!!root && c.parent_id === root.id));
      });
    });
  });
  return copies;
}

function byCreated(a: FigmaComment, b: FigmaComment): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

export interface PinResult {
  meta: ClientMeta | undefined;
  location: string | null;
}

// Rebuild the pin position for the target file. Only the documented fields are
// sent back. A pin whose frame can't be found falls back to the frame's old
// absolute position, and the comment text records where it used to be.
export function transformMeta(meta: ClientMeta | null | undefined, nodeMap: Record<string, string | null>,
  locators: Locators | undefined): PinResult {
  if (!meta) return { meta: undefined, location: null };
  const hasRegion = meta.region_width != null && meta.region_height != null;
  const region: ClientMeta = hasRegion ? { region_width: meta.region_width, region_height: meta.region_height } : {};
  if (hasRegion && meta.comment_pin_corner) region.comment_pin_corner = meta.comment_pin_corner;

  if (meta.node_id) {
    const offset = meta.node_offset || { x: 0, y: 0 };
    const newId = nodeMap[meta.node_id];
    if (newId) {
      return { meta: Object.assign({ node_id: newId, node_offset: { x: offset.x, y: offset.y } }, region), location: null };
    }
    const loc = locators && locators[meta.node_id];
    const where = loc ? ([loc.page] as (string | null)[]).concat(loc.path).filter(Boolean).join(' › ') : 'unknown frame';
    const base = loc && loc.abs ? loc.abs : { x: 0, y: 0 };
    return { meta: Object.assign({ x: base.x + offset.x, y: base.y + offset.y }, region), location: where };
  }
  return { meta: Object.assign({ x: meta.x, y: meta.y }, region), location: null };
}

export interface PlannedReply {
  sourceId: string;
  existingId: string | null;
  message: string;
}

export interface PlannedThread {
  sourceId: string;
  existingId: string | null;
  message: string;
  client_meta: ClientMeta | undefined;
  unmatched: boolean;
  resolved: boolean;
  replies: PlannedReply[];
}

export interface PlanCounts {
  roots: number;
  replies: number;
  done: number;
  toPost: number;
  resolved: number;
  unmatched: number;
  skipped: number;
  skippedDeleted: number;
  misplaced: number;
  unrecognized: number;
}

export interface Plan {
  threads: PlannedThread[];
  misplaced: PlannedReply[];
  counts: PlanCounts;
}

export interface PlanOptions {
  skipResolved?: boolean;
  skipDeletedFrames?: boolean;
}

// Turn an export file plus the target file's current comments into an ordered
// list of posts. Comments already present (matched by fingerprint) are marked done.
// options.skipResolved leaves out resolved threads and their replies, and
// options.skipDeletedFrames leaves out threads whose frame was gone at export.
export function buildPlan(exportData: Pick<ExportFile, 'comments' | 'locators'>, existingComments: FigmaComment[] | null | undefined,
  nodeMap: Record<string, string | null>, options?: PlanOptions): Plan {
  const comments = exportData.comments.slice();
  const ids: Record<string, true> = {};
  comments.forEach((c) => { ids[c.id] = true; });

  // A reply whose parent is missing from the export is posted as its own thread.
  const roots = comments.filter((c) => !c.parent_id || !ids[c.parent_id]).sort(byCreated);
  const repliesByRoot: Record<string, FigmaComment[]> = {};
  comments.forEach((c) => {
    if (c.parent_id && ids[c.parent_id]) (repliesByRoot[c.parent_id] = repliesByRoot[c.parent_id] || []).push(c);
  });

  const plan: Plan = {
    threads: [],
    misplaced: [],
    counts: { roots: 0, replies: 0, done: 0, toPost: 0, resolved: 0, unmatched: 0, skipped: 0, skippedDeleted: 0, misplaced: 0, unrecognized: 0 },
  };
  roots.forEach((root) => {
    if (options && options.skipResolved && root.resolved_at) {
      plan.counts.skipped += 1 + (repliesByRoot[root.id] || []).length;
      return;
    }
    if (options && options.skipDeletedFrames && frameDeleted(root, exportData.locators)) {
      plan.counts.skippedDeleted += 1 + (repliesByRoot[root.id] || []).length;
      return;
    }
    const t = transformMeta(root.client_meta, nodeMap, exportData.locators);
    plan.threads.push({
      sourceId: root.id,
      existingId: null,
      message: buildRootMessage(root, t.location),
      client_meta: t.meta,
      unmatched: !!t.location,
      resolved: !!root.resolved_at,
      replies: (repliesByRoot[root.id] || []).sort(byCreated).map((r) => ({ sourceId: r.id, existingId: null, message: buildReplyMessage(r) })),
    });
  });

  const copies = matchCopies(plan.threads, existingComments);
  const matched: Record<string, true> = {};
  Object.keys(copies).forEach((id) => { const copy = copies[id]; if (copy) matched[copy.id] = true; });
  // Comments with a copy label that match nothing in this export: a re-run may duplicate them.
  plan.counts.unrecognized = (existingComments || []).filter((c) => fingerprint(c.message) && !matched[c.id]).length;
  plan.threads.forEach((thread) => {
    const rootCopy = copies[thread.sourceId];
    thread.existingId = rootCopy ? rootCopy.id : null;
    plan.counts.roots++;
    if (thread.resolved) plan.counts.resolved++;
    if (thread.unmatched) plan.counts.unmatched++;
    if (thread.existingId) plan.counts.done++; else plan.counts.toPost++;
    thread.replies.forEach((r) => {
      const copy = copies[r.sourceId];
      r.existingId = copy ? copy.id : null;
      plan.counts.replies++;
      if (r.existingId) plan.counts.done++; else plan.counts.toPost++;
      // Already copied, but under a different thread's copy. A re-run won't move it.
      if (copy && rootCopy && copy.parent_id !== rootCopy.id) { plan.counts.misplaced++; plan.misplaced.push(r); }
    });
  });
  return plan;
}

// Check the target file after import: every source comment has a copy, and
// every copied reply sits under the copy of its original thread.
export function verifyImport(plan: Pick<Plan, 'threads'>, targetComments: FigmaComment[] | null | undefined):
  { missing: string[]; misplaced: string[] } {
  const copies = matchCopies(plan.threads, targetComments);
  const missing: string[] = [];
  const misplaced: string[] = [];
  plan.threads.forEach((t) => {
    const root = copies[t.sourceId];
    if (!root) missing.push(t.sourceId);
    t.replies.forEach((r) => {
      const copy = copies[r.sourceId];
      if (!copy) missing.push(r.sourceId);
      else if (root && copy.parent_id !== root.id) misplaced.push(r.sourceId);
    });
  });
  return { missing, misplaced };
}

export interface SentComment {
  id: string;
  sourceId: string;
  message: string;
}

export interface AlteredComment {
  id: string;
  sourceId: string;
  sent: string;
  saved: string | undefined;
  recognized: boolean;
}

// Posts that Figma saved with different text than was sent. `recognized` says whether
// the details still identify it as a copy; if not, running Import again would post it twice.
export function findAltered(sent: SentComment[], targetComments: FigmaComment[] | null | undefined): AlteredComment[] {
  const byId: Record<string, FigmaComment> = {};
  (targetComments || []).forEach((c) => { byId[c.id] = c; });
  return sent.filter((s) => byId[s.id] && fingerprint(byId[s.id].message) !== fingerprint(s.message)).map((s) => {
    const saved = byId[s.id].message;
    const key = detailsKey(saved);
    return { id: s.id, sourceId: s.sourceId, sent: s.message, saved, recognized: !!key && key === detailsKey(s.message) };
  });
}

// "45 seconds", "3 minutes", "2 hours", "3 days"
export function formatWait(seconds: number): string {
  const units: [number, number, string][] = [[86400 * 1.5, 86400, 'day'], [5400, 3600, 'hour'], [90, 60, 'minute'], [0, 1, 'second']];
  for (const [threshold, size, unit] of units) {
    if (seconds >= threshold) {
      const n = Math.max(1, Math.round(seconds / size));
      return n + ' ' + unit + (n === 1 ? '' : 's');
    }
  }
  return 'a moment';
}

export function commentNodeIds(comments: FigmaComment[]): string[] {
  const seen: Record<string, true> = {};
  comments.forEach((c) => {
    if (c.client_meta && c.client_meta.node_id) seen[c.client_meta.node_id] = true;
  });
  return Object.keys(seen);
}

// Whether a comment is pinned to a frame that wasn't in the file at export.
export function frameDeleted(comment: FigmaComment, locators: Locators | undefined): boolean {
  return !!(comment.client_meta && comment.client_meta.node_id && locators && !locators[comment.client_meta.node_id]);
}

// Compares the linked file's comments with the open file. If no pinned frame at all
// is in the open file, the link is for a different file. Otherwise missing frames were
// deleted over time (common in long-lived files), and the threads on them are counted.
export function checkOpenFile(comments: FigmaComment[], locators: Locators): { wrongFile: boolean; threadsWithoutFrame: number } {
  const ids = commentNodeIds(comments);
  const found = ids.filter((id) => locators[id]).length;
  const threadsWithoutFrame = comments.filter((c) => !c.parent_id && frameDeleted(c, locators)).length;
  return { wrongFile: ids.length > 0 && found === 0, threadsWithoutFrame };
}

// Labels written by earlier versions of this plugin, so their copies can still be removed.
const OLD_MARKERS: Record<string, true> = { '[Migrated comment]': true, '[Migrated reply]': true };

export interface CopiedGroup {
  userId: string;
  handle: string;
  comments: FigmaComment[];
}

// Copied comments in a file, grouped by who posted them (largest group first), threads
// before replies within each group. Only the poster can delete a comment, so removal
// works one group at a time.
export function groupCopied(comments: FigmaComment[] | null | undefined): CopiedGroup[] {
  const groups: Record<string, CopiedGroup> = {};
  const order: string[] = [];
  (comments || []).forEach((c) => {
    const first = String(c.message || '').replace(/\r\n?/g, '\n').trim().split('\n')[0].replace(/\s+$/, '');
    if (!MARKERS[first] && !OLD_MARKERS[first]) return;
    const id = c.user && c.user.id || 'unknown';
    if (!groups[id]) { groups[id] = { userId: id, handle: c.user && c.user.handle || 'unknown', comments: [] }; order.push(id); }
    groups[id].comments.push(c);
  });
  return order.map((id) => {
    const g = groups[id];
    g.comments = g.comments.filter((c) => !c.parent_id).concat(g.comments.filter((c) => c.parent_id));
    return g;
  }).sort((a, b) => b.comments.length - a.comments.length);
}

export function safeFileName(name: string | null | undefined): string {
  return (String(name || 'figma-file').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'figma-file') + ' - comments.json';
}
