// Writes docs/visual-qa/index.html (screenshots and text, by flow; generated, not committed) and
// docs/visual-qa/messages.md (every message as plain text; committed, so it's readable on GitHub
// and links to no generated file) from the states scripts/visual-qa/run.mjs recorded.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// **Control names** are bold, as in the plugin.
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const KIND = { success: 'Success', warning: 'Warning', error: 'Error', info: 'Info', progress: 'In progress' };

function statusHtml(st) {
  return '<div class="msg msg-' + esc(st.kind) + '">' +
    '<span class="chip">' + esc(KIND[st.kind] || st.kind) + '</span>' +
    (st.title ? '<p class="msg-title">' + rich(st.title) + '</p>' : '') +
    (st.body ? '<p>' + rich(st.body) + '</p>' : '') +
    (st.note ? '<p class="msg-note">' + rich(st.note) + '</p>' : '') +
    (st.items.length ? '<ul>' + st.items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '') +
    '</div>';
}

function stateHtml(s, themes) {
  const t = s.text;
  return '<article class="state" id="' + esc(s.id) + '">' +
    '<div class="state-text">' +
      '<h3>' + esc(s.name) + '</h3>' +
      '<p class="when"><span class="label">When</span> ' + rich(s.when) + '</p>' +
      (t.welcome ? '<div class="msg msg-plain"><span class="chip">Screen text</span><p>' + rich(t.welcome) + '</p></div>' : '') +
      t.statuses.map(statusHtml).join('') +
      (t.summary.length ? '<table class="summary"><caption>Summary</caption>' +
        t.summary.map(([a, b]) => '<tr><th scope="row">' + esc(a) + '</th><td>' + esc(b) + '</td></tr>').join('') + '</table>' : '') +
      (t.buttons.length ? '<p class="buttons"><span class="label">Buttons</span> ' +
        t.buttons.map((b) => '<span class="btn">' + esc(b) + '</span>').join(' ') + '</p>' : '') +
      '<p class="state-id">' + esc(s.id) + '</p>' +
    '</div>' +
    '<div class="shots">' + themes.map((th) =>
      '<figure><img src="png/' + esc(s.id) + '.' + th + '.png" alt="' + esc(s.name) + ', ' + th + ' theme" loading="lazy" width="440">' +
      '<figcaption>' + (th === 'light' ? 'Light theme' : 'Dark theme') + '</figcaption></figure>').join('') + '</div>' +
  '</article>';
}

function textOnlyHtml(s) {
  return '<article class="state" id="' + esc(s.id) + '"><div class="state-text">' +
    '<h3>' + esc(s.name) + '</h3><p class="when"><span class="label">When</span> ' + rich(s.when) + '</p>' +
    '<div class="msg msg-error"><span class="chip">' + esc(s.kind) + '</span><p>' + esc(s.text) + '</p></div>' +
    '<p class="state-id">' + esc(s.id) + '</p></div>' +
    '<div class="shots"><p class="no-shot">No screenshot: see “When”.</p></div></article>';
}

const STYLE = `
/* Layout: a contents rail beside a single column of states; each state puts its text beside its two screenshots. */
:root {
  --bg: #f6f8fb; --surface: #ffffff; --fg: #18202b; --muted: #5b6676; --line: #dde3ea; --accent: #0b7fd8;
  --ok: #12804a; --warn: #9a5b00; --bad: #c4321c; --info: #0b6fbf;
  --ok-tint: #e5f4ec; --warn-tint: #fbf0dc; --bad-tint: #fbe7e3; --info-tint: #e3f0fb; --neutral-tint: #edf1f5;
  --font-body: "Public Sans", "Segoe UI", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #14181e; --surface: #1c222a; --fg: #e8edf3; --muted: #9aa6b5; --line: #2f3843; --accent: #5cb4f5;
  --ok: #6fd39b; --warn: #f2c35e; --bad: #ff9a85; --info: #7cc4f8;
  --ok-tint: #1b3326; --warn-tint: #3a2f17; --bad-tint: #3d211c; --info-tint: #18304a; --neutral-tint: #252c35; color-scheme: dark;
} }
:root[data-theme="dark"] {
  --bg: #14181e; --surface: #1c222a; --fg: #e8edf3; --muted: #9aa6b5; --line: #2f3843; --accent: #5cb4f5;
  --ok: #6fd39b; --warn: #f2c35e; --bad: #ff9a85; --info: #7cc4f8;
  --ok-tint: #1b3326; --warn-tint: #3a2f17; --bad-tint: #3d211c; --info-tint: #18304a; --neutral-tint: #252c35; color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.55 var(--font-body); }
.page { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 40px; max-width: 1400px; margin: 0 auto; padding: 40px 24px 80px; }
nav { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 24px); align-self: start; display: grid; gap: 4px; font-size: 14px; }
nav a { color: var(--muted); text-decoration: none; padding: 4px 8px; border-radius: 6px; display: flex; justify-content: space-between; gap: 8px; }
nav a:hover, nav a:focus-visible { color: var(--fg); background: var(--neutral-tint); outline: none; }
nav a span { font-variant-numeric: tabular-nums; }
header { display: grid; gap: 12px; max-width: 70ch; margin-bottom: 16px; }
h1 { margin: 0; font-size: 36px; line-height: 1.15; letter-spacing: -0.01em; text-wrap: balance; }
header p { margin: 0; color: var(--muted); }
code, .state-id { font-family: var(--font-mono); font-size: 0.85em; }
h2 { font-size: 22px; margin: 48px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--line); text-wrap: balance; }
.state { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; padding: 24px 0; border-bottom: 1px solid var(--line); }
.state:last-child { border-bottom: 0; }
.state-text { display: grid; gap: 12px; align-content: start; min-width: 0; max-width: 62ch; }
h3 { margin: 0; font-size: 18px; text-wrap: balance; }
.state-text p { margin: 0; }
.label { display: inline-block; min-width: 4.5em; color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.when { color: var(--muted); }
.msg { --tone: var(--muted); --tint: var(--neutral-tint); display: grid; gap: 6px; padding: 12px 14px; border-radius: 8px; background: var(--tint); border-left: 3px solid var(--tone); }
.msg-success { --tone: var(--ok); --tint: var(--ok-tint); }
.msg-warning { --tone: var(--warn); --tint: var(--warn-tint); }
.msg-error { --tone: var(--bad); --tint: var(--bad-tint); }
.msg-info, .msg-progress { --tone: var(--info); --tint: var(--info-tint); }
.chip { justify-self: start; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--tone); }
.msg-title { font-weight: 700; }
.msg-note { color: var(--muted); font-size: 14px; }
.msg ul { margin: 0; padding-left: 18px; font-size: 14px; display: grid; gap: 4px; }
.msg-plain p { font-size: 14px; }
.summary { border-collapse: collapse; font-size: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.summary caption { text-align: left; padding-bottom: 4px; color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.summary th, .summary td { padding: 6px 12px; border-top: 1px solid var(--line); vertical-align: top; }
.summary tr:first-of-type th, .summary tr:first-of-type td { border-top: 0; }
.summary th { text-align: left; font-weight: 400; color: var(--muted); }
.summary td { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.buttons { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.btn { font-size: 13px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
.state-id { color: var(--muted); }
.shots { display: flex; gap: 16px; align-items: flex-start; }
figure { margin: 0; display: grid; gap: 6px; width: 300px; }
figure img { width: 100%; height: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
figcaption { font-size: 12px; color: var(--muted); }
.no-shot { width: 300px; margin: 0; color: var(--muted); font-size: 14px; }
@media (max-width: 1100px) { .state { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) {
  .page { grid-template-columns: minmax(0, 1fr); padding-inline: 16px; }
  nav { position: static; }
  .shots { flex-wrap: wrap; }
  figure, .no-shot { width: min(300px, 100%); }
}`;

export async function writeReport(out, groups, shots, textOnly, themes) {
  const byGroup = (g) => shots.filter((s) => s.group === g);
  const extra = (g) => textOnly.filter((s) => s.group === g);
  const count = (g) => byGroup(g).length + extra(g).length;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Copy Comments Visual QA</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=Public+Sans:wght@400;600;700&display=swap">
<style>${STYLE}</style>
</head>
<body>
<div class="page">
<nav aria-label="Flows">${groups.map((g) => '<a href="#' + slug(g) + '">' + esc(g) + '<span>' + count(g) + '</span></a>').join('')}</nav>
<main>
<header>
<h1>Copy Comments visual QA</h1>
<p>Every screen and message in the plugin, with what makes it appear. ${shots.length} states, each in Figma’s light and dark themes, plus ${textOnly.length} messages listed as text only.</p>
<p>Generated by <code>npm run visual-qa</code>, which drives the real plugin UI against a fake Figma. The comments, names, and files are made up. Don’t edit this page by hand; run the command again after changing the UI.</p>
</header>
${groups.map((g) => '<section aria-labelledby="' + slug(g) + '"><h2 id="' + slug(g) + '">' + esc(g) + '</h2>' +
  byGroup(g).map((s) => stateHtml(s, themes)).join('') + extra(g).map(textOnlyHtml).join('') + '</section>').join('\n')}
</main>
</div>
</body>
</html>
`;
  await writeFile(join(out, 'index.html'), html);

  const md = ['# Copy Comments messages', '',
    'Every message the plugin can show, with what makes it appear. Names and numbers are made-up examples.', '',
    'Generated by `npm run visual-qa`. Run it after changing any message: CI fails when this file is out of date.',
    'The same run makes screenshots of every state, which aren’t committed: open `docs/visual-qa/index.html` to see them all,',
    'or find a state’s pair by the ID at the end of its entry, as `png/<id>.light.png` and `png/<id>.dark.png`.', ''];
  groups.forEach((g) => {
    md.push('## ' + g, '');
    byGroup(g).forEach((s) => {
      md.push('### ' + s.name, '', '*When:* ' + s.when, '');
      if (s.text.welcome) md.push(s.text.welcome.split('\n').filter(Boolean).map((l) => '> ' + l).join('\n>\n'), '');
      s.text.statuses.forEach((st) => {
        md.push('**' + (KIND[st.kind] || st.kind) + (st.title ? ': ' + st.title : '') + '**', '');
        if (st.body) md.push(st.body, '');
        if (st.note) md.push('*Note:* ' + st.note, '');
        st.items.forEach((i) => md.push('- ' + i));
        if (st.items.length) md.push('');
      });
      if (s.text.summary.length) md.push('| Summary | |', '|---|---:|', ...s.text.summary.map(([a, b]) => '| ' + a + ' | ' + b + ' |'), '');
      if (s.text.buttons.length) md.push('*Buttons:* ' + s.text.buttons.join(' · '), '');
      md.push('ID: `' + s.id + '`', '');
    });
    extra(g).forEach((s) => md.push('### ' + s.name, '', '*When:* ' + s.when, '', '**' + s.kind + '**', '', s.text, ''));
  });
  await writeFile(join(out, 'messages.md'), md.join('\n'));
}
