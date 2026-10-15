# Copy Comments

A Figma plugin that copies comments from one Figma file to another, for example from a commercial Figma org to its copy in **Figma for Government**.

Figma's official migration path to Figma for Government is to save each file as `.fig` and import it. That path **doesn't carry over comments** ([Figma for Government](https://help.figma.com/hc/en-us/articles/22932461365015-Figma-for-Government)). This plugin fills that gap.

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

This works in the **browser or the desktop app**. You need two personal access tokens: one made in the Figma environment you're copying FROM and one made in the environment you're copying TO. To make one, open Home › [Your Name] › Settings › Security › Personal access tokens ([how-to](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens)).

The first time you open the plugin, a setup screen explains the tokens and how to make them. Copying between two environments needs two tokens, one made in each. Name each token something like "Copy Comments", and set its expiration to 1 day; that's enough for a one-time copy. To see it again later, click **Token setup guide** next to either token field's label.

| Token | Make it in | Scopes |
|---|---|---|
| Export | the environment you're copying FROM | `file_comments:read` |
| Import | the environment you're copying TO | `file_comments:read` **and** `file_comments:write` |

Leave every other scope off. Import uses read to preview, skip comments that were already copied, and check the result, and write to post. You need to be able to open both files and edit the file you're copying TO, because Import saves a version to its history before posting. Copied comments are posted under the name of whoever runs Import.

Whoever runs Import should have a **Full or Dev seat** in the environment you're copying TO. Figma limits how fast each account can use its API, and View and Collab seats get the lowest limit ([rate limits](https://developers.figma.com/docs/rest-api/rate-limits)). The plugin posts about 40 comments a minute and slows down if Figma asks it to, so 500 comments take about 15 minutes.

### 1. Export (in the file you're copying FROM)
1. Open the file you're copying FROM and choose **Plugins › Copy Comments**. It opens on the **Export** tab.
2. Paste the file's link and your **Export** token.
3. Click **Export comments**. A `<file name> - comments.json` file downloads. Keep it.

### 2. Move the file
In the file you're copying FROM, choose **File › Save local copy…**. Then import the `.fig` into the environment you're copying TO. If an admin or Figma is moving your files for you, skip this step.

### 3. Import (in the file you're copying TO)
1. Open the file you're copying TO, choose **Plugins › Copy Comments**, and switch to the **Import** tab.
2. Paste that file's link and your **Import** token.
3. Choose the `.json` file from step 1. To leave out resolved threads and their replies, tick **Skip resolved threads**. Then click **Preview** and check the numbers. Preview also checks that the link is for the open file, because pins are matched in the open file but posted to the linked one.
4. Click **Post comments** and keep the window open until it says **Import complete**. Before posting, the plugin saves a version named **Before Copy Comments import** to the file's version history, which needs edit access to the file; if it can't save one, it stops without posting. Comments aren't part of version history, so restoring that version won't remove the copied comments. It marks when the import happened. The plugin then checks the file and reports anything missing.

If something fails, run **Preview** then **Post comments** again. Comments that were already copied are skipped. Before reporting a comment as missing, the plugin checks the file again for up to 15 seconds, because Figma can take a moment to list new comments. A post that returned an error but did reach the file counts as posted.

If a reply ends up under the wrong thread, Preview and the final message say so; the developer console lists which ones. Figma can't move a reply, so delete it, then run **Preview** and **Post comments** again to post it in the right thread.

If the plugin says **Don't run Import again on this file**, don't. Figma changed some comments so much, including the author and time below the `———` line, that a re-run can't recognize them and would post them twice. Examples of the change are in the developer console (**Plugins › Development › Show/Hide console**).

**Tokens:** "Remember on this device" stores a token only in this browser or app, through Figma's plugin storage. Untick it on shared computers. Tokens are only ever sent to `api.figma.com` or `api.figma-gov.com`; the manifest blocks every other domain.

**The exported file:** the `.json` holds every comment's text, the authors' Figma handles, and the names of the frames comments are pinned to. Treat it like the design file: keep it out of public channels, and delete it once the copied comments are checked.

**Notifications:** posting hundreds of comments may notify people who follow the file you're copying TO. Tell them before you run Import.

---

## For admins
- **Figma for Government** can only use third-party plugins that an admin has approved, and private org plugins can't be published there ([Figma for Government](https://help.figma.com/hc/en-us/articles/22932461365015-Figma-for-Government)). Approve Copy Comments from its Community page: **Admin › Resources › Plugins › Add plugin**, then paste the Community link ([Manage plugins](https://help.figma.com/hc/en-us/articles/4404228724759-Manage-plugins-and-widgets-in-an-organization)).
- **Commercial org:** approve it the same way if plugin approval is turned on.
- **Network:** allow `figma-gov.com` (and `api.figma-gov.com`) on port 443.

---

## For the builder

### Files
| File | Purpose |
|---|---|
| `manifest.json` | Plugin manifest. `networkAccess` allows only the two Figma API hosts |
| `code.js` | Main thread: node lookups (`getNodeByIdAsync`) and token storage (`clientStorage`). The Plugin API has no comments API |
| `ui.html` | UI, plus the REST calls (`fetch` with `X-Figma-Token`). The block between `BEGIN LOGIC` and `END LOGIC` is pure, tested logic |
| `test/logic.test.js` | Unit tests for that logic: `node --test test/logic.test.js` |
| `.gitignore` | Keeps exported comment files (`*comments*.json`) out of the repo, since they hold real comment text |

No build step: this is plain JavaScript, not TypeScript.

### 1. Load the plugin
Development plugins only work in the **desktop app** ([docs](https://help.figma.com/hc/en-us/articles/360039958874-Make-plugins-for-the-Figma-Community)). The plugin ID is already in `manifest.json`; keep it, because Community publishing and admin approvals are tied to it.

Choose **Plugins › Development › Import plugin from manifest…** and select this folder's `manifest.json`.

### 2. Spike: confirm the two unknowns before anything else
- [ ] **Commercial:** run Export on a test file. Check that the `.json` downloads and the counts look right.
- [ ] **Gov, plugin can run:** do development plugins run in the Figma for Government org at all? If not, this check moves to after the Community publish (step 4).
- [ ] **Gov, API reachable:** Import's **Preview** calls `GET https://api.figma-gov.com/v1/files/:key/comments` from the plugin. A plugin's UI has a `null` origin, so this only works if the Gov API allows cross-origin requests ([network requests](https://developers.figma.com/docs/plugins/making-network-requests/)). If you see "Could not reach https://api.figma-gov.com", use the fallback below.

### 3. Pilot
Make a throwaway commercial file containing:
- a pin on empty canvas, a pin on a frame, a region drag on canvas, and a region drag on a frame
- a thread with replies, plus one resolved thread and one open thread
- reactions on a thread and on a reply, an @mention, emoji, and one very long comment

Export it, save a local copy, import it to Gov, then run Import. Check:
- [ ] The final message says **Import complete** (no missing comments, no misplaced replies). If it also says Figma changed the text of some comments, open a few with @mentions or blank lines and check that they read correctly. If it says **Don't run Import again on this file** instead, copy the examples from the developer console, because the plugin's message format needs to change before anyone else imports.
- [ ] Check whether the people @mentioned in the original comments were notified when the copies were posted.
- [ ] Pins sit on the same frames and offsets. Note which **page** the canvas pins and canvas regions land on, because those positions carry no page.
- [ ] Headers read correctly, and the long comment wasn't rejected.
- [ ] Running Import again reports **"Already up to date."**
- [ ] Note who was notified about the posted comments (file owner, followers, anyone else), and whether by email.

### 4. Publish and approve
1. Publish to Figma Community under a team or organization profile ([how-to](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community)). Figma reviews it first, which takes some time.
   Draft description for the Community page:
   > Copies comments from one Figma file to another, such as from commercial Figma to Figma for Government. Each copied comment records the original author, time, status, and reactions in its text.
2. Have the admins in **both** orgs approve the Community link.
3. Repeat the pilot's Import step **in a browser** with the published version.

### Fallback: the plugin can't reach `api.figma-gov.com`
Keep using the plugin for **Export**. For **Import**, one technical person posts the comments from the `.json` with a script against `https://api.figma-gov.com`, reusing `buildPlan` and the message format from `ui.html`. Everyone else only does Export.
