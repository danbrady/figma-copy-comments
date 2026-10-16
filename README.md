# Copy Comments

**User guide:** [danbrady.github.io/figma-copy-comments](https://danbrady.github.io/figma-copy-comments/) · **Privacy policy:** [PRIVACY.md](PRIVACY.md) · **Help:** [GitHub issues](https://github.com/danbrady/figma-copy-comments/issues)

A Figma plugin that copies comments from one Figma file to another, such as a duplicate of the file, even when the two files belong to different Figma accounts.

Duplicating a file, or saving it as a `.fig` and importing it, **leaves its comments behind**. This plugin fills that gap.

## Using the plugin
How to use the plugin lives in one place, the [user guide](https://danbrady.github.io/figma-copy-comments/), so it can't drift from this README:

- [Before you start](https://danbrady.github.io/figma-copy-comments/#before-you-start): making personal access tokens, and which scopes and seats you need
- [Export](https://danbrady.github.io/figma-copy-comments/#1-export), [make the copy](https://danbrady.github.io/figma-copy-comments/#2-make-the-copy), and [Import](https://danbrady.github.io/figma-copy-comments/#3-import)
- [Undo an import](https://danbrady.github.io/figma-copy-comments/#undo-an-import) and [If something goes wrong](https://danbrady.github.io/figma-copy-comments/#if-something-goes-wrong)
- [What gets copied](https://danbrady.github.io/figma-copy-comments/#what-gets-copied), including the copied-comment format
- [Good to know](https://danbrady.github.io/figma-copy-comments/#good-to-know): notifications, the exported file, your data, and notes for admins
- [FAQ](https://danbrady.github.io/figma-copy-comments/#faq)

What the plugin reads and keeps is in [PRIVACY.md](PRIVACY.md), which the site publishes at [/privacy/](https://danbrady.github.io/figma-copy-comments/privacy/). Both are edited in this repo: the guide in [`site/index.md`](site/index.md), the policy in `PRIVACY.md`.

---

## For the builder

### Files
The plugin is written in TypeScript, following Figma's setup: [`@figma/plugin-typings`](https://github.com/figma/plugin-typings) for the Plugin API types and [`@figma/eslint-plugin-figma-plugins`](https://github.com/figma/eslint-plugin-figma-plugins) for linting. [esbuild](https://esbuild.github.io/) builds it into `dist/`, which is what Figma loads; `dist/` isn't committed.

| File | Purpose |
|---|---|
| `manifest.json` | Plugin manifest. Points at `dist/code.js` and `dist/ui.html`; `networkAccess` allows only the two Figma API hosts |
| `src/code.ts` | Main thread: node lookups (`getNodeByIdAsync`) and the setup screen's "don't show again" setting (`clientStorage`). Tokens are never stored; ones saved by earlier versions are deleted at startup. The Plugin API has no comments API. Messages from the UI are checked before use |
| `src/ui.ts` | UI: the REST calls (`fetch` with `X-Figma-Token`), Export, Preview, Post, and Remove |
| `src/logic.ts` | Pure, tested logic: message format, matching copies, planning and checking an import |
| `src/types.ts`, `src/messages.ts` | Shared types: Figma comment data, and the messages between the UI and the main thread |
| `src/ui.html` | UI markup and styles. The build inlines the compiled `ui.ts` into `dist/ui.html`, since a plugin's UI is a single HTML file |
| `scripts/build.mjs` | The esbuild build: `dist/code.js`, `dist/ui.html`, and (for tests) `dist/test/logic.cjs` |
| `scripts/visual-qa/` | `npm run visual-qa`: drives the built UI against a fake Figma (`fake-figma.mjs`) through every scenario (`scenarios.mjs`) and writes the report (`report.mjs`) |
| `docs/visual-qa/` | Every screen and message, generated: `index.html` (screenshots in light and dark, with what makes each appear), `messages.md` (all message text), and `png/` |
| `scripts/listing.mjs` | Renders the Community listing images in `assets/listing/` from the pages in `assets/listing/src/` |
| `site/` | The GitHub Pages site the Community listing links to: the user guide (`index.md`), layout, and styles. `.github/workflows/pages.yml` builds it with Jekyll and adds `PRIVACY.md` and the listing images |
| `PRIVACY.md` | The privacy policy: what the plugin reads, where it goes, and what it keeps. Figma requires one for plugins that handle user data |
| `assets/listing/listing.md` | The Community listing's name, description, tags, and a note for reviewers |
| `assets/listing/` | Community listing images: `icon.png` (128×128), `cover.png` and three `carousel-*.png` (1920×1080). The carousel shows the real plugin UI from `src/ui.html`, with made-up data |
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
| `npm run visual-qa` | Rebuilds, then regenerates `docs/visual-qa/`. Fails if a message in `src/ui.ts` isn't reached by any scenario, so add one when you add a message |
| `npm run listing` | Re-renders the images in `assets/listing/` with your installed Google Chrome (set `CHROME_PATH` to use another). Run it after changing the UI |

### How re-runs recognize copies
Import skips comments it already copied, so a re-run, a retry after an error, or two people importing into the same file don't create duplicates. `src/logic.ts` matches each planned comment to an existing copy:
- **By its text:** the label, the original text, and the details below the `———` line, ignoring the last `Location:` line, which changes if frames are fixed between runs (`fingerprint`).
- **By author and time, if the text changed:** Figma sometimes rewrites comment text when it saves it, for example @mentions or blank lines. Those copies still match on the label plus the author-and-time line below the `———` (`detailsKey`).
- **One to one:** identical comments, such as two "+1" replies from the same person in the same second, each need their own copy. Exact text is tried before author and time, so it decides between look-alikes.

What breaks matching: editing a copied comment's text by hand, or importing from a newer export taken after reactions or resolved states changed. Preview warns when the file has copied comments that match nothing in the export file. Export each original file once and reuse that export file for every Import.

### 1. Load the plugin
Development plugins only work in the **desktop app** ([docs](https://help.figma.com/hc/en-us/articles/360039958874-Make-plugins-for-the-Figma-Community)). The plugin ID is already in `manifest.json`; keep it, because Community publishing and admin approvals are tied to it.

1. In this folder, run `npm install`, then `npm run build`. While you're changing code, run `npm run watch` (or press **Cmd+Shift+B** in VS Code) instead, so `dist/` stays current.
2. In Figma, choose **Plugins › Development › Import plugin from manifest…** and select this folder's `manifest.json`.

If Figma says it can't find `dist/code.js` or `dist/ui.html`, the build hasn't run yet.

### 2. Spike: confirm the unknowns before anything else
- [ ] **Export:** run Export on a test file. Check that the `.json` downloads and the counts look right.
- [ ] **Plugin can run:** do development plugins run in the organization you're copying TO? If not, this check moves to after the Community publish (step 4).
- [x] **API reachable:** checked October 16, 2026. From a sandboxed iframe in Chrome (origin `null`, like a plugin window), GET, POST, and DELETE to both `api.figma.com` and `api.figma-gov.com` returned readable responses: both send `Access-Control-Allow-Origin: *`, allow the `X-Figma-Token` and `Content-Type` headers, and expose `Retry-After`. The check used a fake token, so the first real Preview in the pilot confirms it with a real one. Import's **Preview** calls `GET /v1/files/:key/comments` on the API of the Figma site the file is on. A plugin's UI has a `null` origin, so this only works if that API allows cross-origin requests ([network requests](https://developers.figma.com/docs/plugins/making-network-requests/)). If you see "Could not reach …", use the fallback below.
- [ ] **Posting and removing:** **Post comments** and **Remove copied comments** send POST and DELETE requests. Browsers check those separately from GET (a CORS preflight). The preflight passes on both hosts (checked October 16, 2026); confirm real posts and removals work in the pilot.

### 3. Pilot
Make a throwaway file containing:
- a pin on empty canvas, a pin on a frame, a region drag on canvas, and a region drag on a frame
- a thread with replies, plus one resolved thread and one open thread
- reactions on a thread and on a reply, an @mention, emoji, and one very long comment

Export it, [make the copy](https://danbrady.github.io/figma-copy-comments/#2-make-the-copy), then run Import in the copy. Use a fresh copy for each pilot run, or remove the previous run's copies first ([Undo an import](https://danbrady.github.io/figma-copy-comments/#undo-an-import)). Check:
- [ ] The final message says **Import complete** (no missing comments, no misplaced replies). Open a few copied comments with @mentions or blank lines and check that they read correctly; Figma may have rewritten them. If the final message says **Don't run Import again on this file** instead, copy the examples of the changed text from the developer console, because the plugin's message format needs to change before anyone else imports.
- [ ] Pins sit on the same frames and offsets. Note which **page** the canvas pins and canvas regions land on, because those positions carry no page.
- [ ] Headers read correctly, and the long comment wasn't rejected.
- [ ] Running Import again reports **"Already up to date."**
- [ ] Note who was notified about the posted comments (file owner, followers, people @mentioned in the originals, anyone else), and whether by email.
- [ ] **Remove copied comments** removes every copy and nothing else: add one regular comment of your own to the file first, and check that it's still there afterward.

### 4. Publish and approve
1. Publish to Figma Community under a team or organization profile ([how-to](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community)). Figma reviews it first, which takes some time.
   Upload the images from `assets/listing/`: `icon.png` as the icon, `cover.png` as the thumbnail, and the three `carousel-*.png` images, in order, as the carousel.
   Paste the name, description, tags, and support contact from [`assets/listing/listing.md`](assets/listing/listing.md). Its links point to the user guide and privacy policy on GitHub Pages, which `.github/workflows/pages.yml` publishes from `site/` and `PRIVACY.md`.
2. If plugin approval is turned on, have the admins of each organization involved approve the Community link.
3. Repeat the pilot's Import step **in a browser** with the published version.

### Fallback: the plugin can't reach Figma's API
Keep using the plugin for **Export**. For **Import**, one technical person posts the comments from the `.json` with a script against the API of the Figma site the copy is on, reusing `buildPlan` and the message format from `src/logic.ts`, and removes them the same way if an import needs undoing (`groupCopied` finds them). Everyone else only does Export.
