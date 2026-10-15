# Copy Comments

A Figma plugin that copies comments from one Figma file to another, such as a duplicate of the file, even when the two files belong to different Figma accounts.

Duplicating a file, or saving it as a `.fig` and importing it, **leaves its comments behind**. This plugin fills that gap.

## What gets copied
Every thread and reply is re-posted in the file you're copying TO, in its original order. Each starts with a label, then the original text, then its details:

```
[Copied comment]
Original comment text
———
alex.rivera · Oct 1, 2026, 9:52:14 AM ET
✅ Resolved Oct 1, 2026, 1:20:05 PM ET
Reactions: :+1: ×3 (A. Lee, B. Ortiz, C. Kim)
```

Open threads have no `Resolved` line, and replies start with `[Copied reply]`. Times are Eastern.

- **Position:** the comment is pinned to the same frame and offset, or to the same canvas spot or region. If a frame can't be found in the file you're copying TO, the comment goes near its old position and a `Location:` line says where it used to be.
- **Who and when:** Figma's API always posts as the person running the import, at the current time ([POST comments](https://developers.figma.com/docs/rest-api/comments-endpoints/)). The original author and time are in the text, and the raw data is in the exported `.json` file.
- **Not copied:**
  - the resolved state itself: Figma's API can't resolve comments, so every copied thread shows as open, and a resolved one says `✅ Resolved` and when in its text. To leave resolved threads out entirely, tick **Skip resolved threads** before Preview.
  - who resolved a thread (the API doesn't provide it)
  - images or attachments in comments
  - live @mentions: they're posted as text, which Figma may rewrite when it saves the comment. The pilot checks whether that notifies anyone.
- **Safe to re-run:** the plugin recognizes comments it already copied by their author, time, and text (ignoring any `Location:` line), and skips them. Figma sometimes changes comment text when it saves it, for example rewriting @mentions or removing blank lines; those copies are still recognized by the author and time below the `———` line. Identical comments, such as two "+1" replies from the same person in the same second, are counted separately. Two people can work on the same file, or you can retry after an error, without creating duplicates. Editing a copied comment's text by hand makes it unrecognizable, so a re-run would post it again. Preview warns when the file has copied comments that don't match the export file. Export each original file once and reuse that export file for every Import: a newer export, taken after reactions or resolved states changed, won't match comments posted from the older one.

---

## For everyone: moving one file

This works in the **browser or the desktop app**. You need a personal access token. A token only works for the account that made it. If one account can open both files, one token is enough; otherwise, make one in each account. To make one, open Home › [Your Name] › Settings › Security › Personal access tokens ([how-to](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens)).

The first time you open the plugin, a setup screen explains the tokens and how to make them. Name each token something like "Copy Comments", and set its expiration to 1 day; that's enough for a one-time copy. To see it again later, click **Token setup guide** next to either token field's label.

| Token | Make it with | Scopes |
|---|---|---|
| Export | an account that can open the file you're copying FROM | `file_comments:read` |
| Import | an account that can comment on the file you're copying TO | `file_comments:read` **and** `file_comments:write` |

Using one token for both? Give it the Import token's scopes.

Leave every other scope off. Import uses read to preview, skip comments that were already copied, and check the result. It uses write to post, and to remove copied comments if you undo an import. You need to be able to open both files and comment on the file you're copying TO. Copied comments are posted under the name of whoever runs Import.

Whoever runs Import should have a **Full or Dev seat** where the file you're copying TO lives. Figma limits how fast each account can use its API, and View and Collab seats get the lowest limit ([rate limits](https://developers.figma.com/docs/rest-api/rate-limits)). The plugin posts about 40 comments a minute and slows down if Figma asks it to, so 500 comments take about 15 minutes. Removing copied comments runs at the same pace.

### 1. Export (in the file you're copying FROM)
1. Open the file you're copying FROM and choose **Plugins › Copy Comments**. It opens on the **Export** tab.
2. Paste the file's link and your **Export** token.
3. Click **Export comments**. A `<file name> - comments.json` file downloads. Keep it.

### 2. Make the copy
Duplicate the file you're copying FROM, or choose **File › Save local copy…** and import the `.fig` where you want the copy. If the copy already exists, skip this step.

### 3. Import (in the file you're copying TO)
1. Open the file you're copying TO, choose **Plugins › Copy Comments**, and switch to the **Import** tab.
2. Paste that file's link and your **Import** token.
3. Choose the `.json` file from step 1. To leave out resolved threads and their replies, tick **Skip resolved threads**. To leave out threads pinned to frames that were already deleted when you exported, and their replies, tick **Skip threads whose frame was deleted**; otherwise they're placed near the top-left of the canvas. In long-lived files these are often most of the old threads: in one file we tested, 163 of 230. Then click **Preview** and check the numbers. Preview also checks that the link is for the open file, because pins are matched in the open file but posted to the linked one.
4. Click **Post comments** and keep the window open until it says **Import complete**.

### If something goes wrong
If something fails, run **Preview** then **Post comments** again. Comments that were already copied are skipped. Before reporting a comment as missing, the plugin checks the file again for up to 15 seconds, because Figma can take a moment to list new comments. A post that returned an error but did reach the file counts as posted.

If a reply ends up under the wrong thread, Preview and the final message say so; the developer console lists which ones. Figma can't move a reply, so delete it, then run **Preview** and **Post comments** again to post it in the right thread.

If the plugin says **Don't run Import again on this file**, don't. Figma changed some comments so much, including the author and time below the `———` line, that a re-run can't recognize them and would post them twice. Examples of the change are in the developer console (**Plugins › Development › Show/Hide console**).

### 4. Undo an import (if needed)
To take the copied comments back out of the file you're copying TO:
1. Open that file, choose **Plugins › Copy Comments**, and switch to the **Import** tab.
2. Paste the file's link and your **Import** token. You don't need the `.json` file.
3. Click **Remove copied comments from this file…**. The plugin counts the comments that start with `[Copied comment]` or `[Copied reply]`, plus the older `[Migrated comment]` and `[Migrated reply]` labels, and says who posted them. Nothing is removed yet.
4. Click the red **Remove** button to confirm, or **Cancel**. Keep the window open until it says **Copied comments removed**.

Figma only lets people delete their own comments, so the plugin removes the copies posted by your token's owner and leaves everything else: regular comments and other people's copies. If someone else also ran Import on this file, they can remove theirs with their own token. Removing can't be undone; run Import again to put the comments back.

Restoring an earlier version from the file's version history doesn't remove comments, because Figma doesn't keep comments in version history.

### Good to know
**Tokens:** "Remember on this device" stores a token only in this browser or app, through Figma's plugin storage. Untick it on shared computers. Tokens are only ever sent to Figma's API; the manifest blocks every other domain.

**The exported file:** the `.json` holds every comment's text, the authors' Figma handles, and the names of the frames comments are pinned to. Treat it like the design file: keep it out of public channels, and delete it once the copied comments are checked.

**Notifications:** posting hundreds of comments may notify people who follow the file you're copying TO. Tell them before you run Import.

---

## For admins
- **Plugin approval:** if your organization only allows approved plugins, an admin approves Copy Comments from its Community page: **Admin › Resources › Plugins › Add plugin**, then paste the Community link ([Manage plugins](https://help.figma.com/hc/en-us/articles/4404228724759-Manage-plugins-and-widgets-in-an-organization)). If the two files are in different organizations, do this in each.
- **Network:** allow the API hosts listed under `networkAccess` in `manifest.json`, on port 443.

---

## For the builder

### Files
The plugin is written in TypeScript, following Figma's setup: [`@figma/plugin-typings`](https://github.com/figma/plugin-typings) for the Plugin API types and [`@figma/eslint-plugin-figma-plugins`](https://github.com/figma/eslint-plugin-figma-plugins) for linting. [esbuild](https://esbuild.github.io/) builds it into `dist/`, which is what Figma loads; `dist/` isn't committed.

| File | Purpose |
|---|---|
| `manifest.json` | Plugin manifest. Points at `dist/code.js` and `dist/ui.html`; `networkAccess` allows only the two Figma API hosts |
| `src/code.ts` | Main thread: node lookups (`getNodeByIdAsync`) and token storage (`clientStorage`). The Plugin API has no comments API. Messages from the UI are checked before use |
| `src/ui.ts` | UI: the REST calls (`fetch` with `X-Figma-Token`), Export, Preview, Post, and Remove |
| `src/logic.ts` | Pure, tested logic: message format, matching copies, planning and checking an import |
| `src/types.ts`, `src/messages.ts` | Shared types: Figma comment data, and the messages between the UI and the main thread |
| `src/ui.html` | UI markup and styles. The build inlines the compiled `ui.ts` into `dist/ui.html`, since a plugin's UI is a single HTML file |
| `scripts/build.mjs` | The esbuild build: `dist/code.js`, `dist/ui.html`, and (for tests) `dist/test/logic.cjs` |
| `tsconfig.json`, `tsconfig.ui.json` | Type checking for the main thread (Figma typings, no DOM) and the UI (DOM, no `figma` global) |
| `eslint.config.mjs` | Figma's recommended ESLint config |
| `test/logic.test.js` | Unit tests for `src/logic.ts`, plus a check that the built `dist/ui.html` script parses |
| `test/main.test.js` | Tests for the built `dist/code.js`, run against a small fake of the Figma Plugin API |
| `.vscode/tasks.json` | **Cmd+Shift+B** (Ctrl+Shift+B on Windows) starts `npm run watch` |
| `.github/workflows/test.yml` | Runs typecheck, lint, and tests on Node 20, 22, and 24 for every push and pull request |
| `.gitignore` | Keeps `dist/`, `node_modules/`, and exported comment files (`*comments*.json`) out of the repo |
| `.editorconfig` | Two-space indents, LF line endings |

| Command | What it does |
|---|---|
| `npm install` | Installs TypeScript, the Figma typings and linter, and esbuild (Node 20 or later) |
| `npm run build` | Builds `dist/` once |
| `npm run watch` | Rebuilds `dist/` on every save; same as **Cmd+Shift+B** in VS Code |
| `npm run typecheck` | Checks types for the main thread and the UI |
| `npm run lint` | Runs Figma's ESLint rules on `src/` |
| `npm test` | Builds, then runs the tests |
| `npm run check` | All three checks: typecheck, lint, and tests |

### 1. Load the plugin
Development plugins only work in the **desktop app** ([docs](https://help.figma.com/hc/en-us/articles/360039958874-Make-plugins-for-the-Figma-Community)). The plugin ID is already in `manifest.json`; keep it, because Community publishing and admin approvals are tied to it.

1. In this folder, run `npm install`, then `npm run build`. While you're changing code, run `npm run watch` (or press **Cmd+Shift+B** in VS Code) instead, so `dist/` stays current.
2. In Figma, choose **Plugins › Development › Import plugin from manifest…** and select this folder's `manifest.json`.

If Figma says it can't find `dist/code.js` or `dist/ui.html`, the build hasn't run yet.

### 2. Spike: confirm the unknowns before anything else
- [ ] **Export:** run Export on a test file. Check that the `.json` downloads and the counts look right.
- [ ] **Plugin can run:** do development plugins run in the organization you're copying TO? If not, this check moves to after the Community publish (step 4).
- [ ] **API reachable:** Import's **Preview** calls `GET /v1/files/:key/comments` on the API of the Figma site the file is on. A plugin's UI has a `null` origin, so this only works if that API allows cross-origin requests ([network requests](https://developers.figma.com/docs/plugins/making-network-requests/)). If you see "Could not reach …", use the fallback below.
- [ ] **Posting and removing:** **Post comments** and **Remove copied comments** send POST and DELETE requests. Browsers check those separately from GET (a CORS preflight), so confirm both work, not just Preview.

### 3. Pilot
Make a throwaway file containing:
- a pin on empty canvas, a pin on a frame, a region drag on canvas, and a region drag on a frame
- a thread with replies, plus one resolved thread and one open thread
- reactions on a thread and on a reply, an @mention, emoji, and one very long comment

Export it, make the copy (see **Make the copy** above), then run Import in the copy. Use a fresh copy for each pilot run, or remove the previous run's copies first (see **Undo an import** above). Check:
- [ ] The final message says **Import complete** (no missing comments, no misplaced replies). Open a few copied comments with @mentions or blank lines and check that they read correctly; Figma may have rewritten them. If the final message says **Don't run Import again on this file** instead, copy the examples from the developer console, because the plugin's message format needs to change before anyone else imports.
- [ ] Pins sit on the same frames and offsets. Note which **page** the canvas pins and canvas regions land on, because those positions carry no page.
- [ ] Headers read correctly, and the long comment wasn't rejected.
- [ ] Running Import again reports **"Already up to date."**
- [ ] Note who was notified about the posted comments (file owner, followers, people @mentioned in the originals, anyone else), and whether by email.
- [ ] **Remove copied comments** removes every copy and nothing else: add one regular comment of your own to the file first, and check that it's still there afterward.

### 4. Publish and approve
1. Publish to Figma Community under a team or organization profile ([how-to](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community)). Figma reviews it first, which takes some time.
   Draft description for the Community page:
   > Copies comments from one Figma file to another, such as a duplicate, even when the files belong to different Figma accounts. Each copied comment records the original author, time, status, and reactions in its text.
2. If plugin approval is turned on, have the admins of each organization involved approve the Community link.
3. Repeat the pilot's Import step **in a browser** with the published version.

### Fallback: the plugin can't reach Figma's API
Keep using the plugin for **Export**. For **Import**, one technical person posts the comments from the `.json` with a script against the API of the Figma site the copy is on, reusing `buildPlan` and the message format from `src/logic.ts`, and removes them the same way if an import needs undoing (`groupCopied` finds them). Everyone else only does Export.
