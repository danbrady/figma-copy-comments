# Community listing

Everything Figma's publish form asks for, in the order it asks. Field names and steps follow Figma's [Publish classic plugins to the Figma Community](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community) and [security disclosure](https://help.figma.com/hc/en-us/articles/16354660649495) guides, checked October 16, 2026. Figma doesn't publish character limits; if a field is too long, the form says so.

**Before you start:** publish from the Figma **desktop app** (macOS or Windows), signed in to an account with **two-factor authentication** turned on. Open any file, then **Figma menu › Plugins › Manage plugins**, open Copy Comments' menu, and choose **Publish**. The plugin ID in `manifest.json` ties the listing to this code; keep it.

---

## 1. Describe your resource

### Name *(required)*

```
Copy Comments
```

### Tagline *(required)*

```
Copy comment threads from one Figma file to another, even across accounts.
```

### Description *(required)*

```
Copy every comment thread from one Figma file to another: a duplicate, a file you saved and imported again, or a copy in another team, organization, or Figma account. Duplicating a file leaves its comments behind; this brings them along.

How it works
1. Export: run the plugin in the original file. It saves every thread and reply to a .json file on your device.
2. Import: run it in the copy and choose that file. Preview shows what will be posted, then Post comments posts it.

What you get
- Comments pinned to the same frames and spots, with replies in order
- The original author, time, resolved status, and reactions written into each comment's text. Copies are posted under your name, because Figma's API always posts as the person running it.
- Safe to re-run: comments that were already copied are skipped
- An undo: Remove copied comments takes the copies back out

What you need
- A Figma personal access token for each account involved. Export needs the scope file_comments:read; Import needs file_comments:read and file_comments:write. The plugin shows you how to make one. It never saves your token, so you paste it each time.
- Permission to comment on the file you're copying to

Good to know
- People who follow the file you're copying to may be notified about the new comments, and people @mentioned in them may be notified too. Preview tells you how many comments mention someone before you post.
- Images and attachments in comments aren't copied. Copied threads show as open, because Figma's API can't resolve comments; a resolved thread says so in its text.
- The plugin only talks to Figma's API. It has no servers and collects no analytics.

Setup guide and FAQ: https://danbrady.github.io/figma-copy-comments/
Privacy policy: https://danbrady.github.io/figma-copy-comments/privacy/
Help: https://github.com/danbrady/figma-copy-comments/issues
```

The description box is plain text with basic formatting. Re-apply bold to section headings (How it works, What you get, What you need, Good to know) if the editor offers it.

### Category *(required)*

**Design tools.** Figma doesn't publish its full category list; this is one of the examples in its guide. If the dropdown has a closer match for working with comments, such as a productivity or collaboration category, pick that.

---

## 2. Choose some images

All files are in this folder (`assets/listing/`). Regenerate them with `npm run listing`.

| Field | File | Notes |
|---|---|---|
| **Icon** | `icon.png` | 128 × 128, as recommended |
| **Thumbnail** *(required)* | `cover.png` | 1920 × 1080, as recommended |
| **Playground file** *(optional)* | none | The plugin needs two files and personal access tokens, so a playground file can't show it working. Leave empty |
| **Carousel** *(optional, up to 9)* | `carousel-1-export.png`, `carousel-2-import.png`, `carousel-3-result.png` | Upload in this order. 1920 × 1080 each |

---

## 3. Data security *(optional, recommended)*

Figma's security disclosure form. Filling it in adds a **Data security info** label to the listing, and answers the review concern about personal access tokens. Figma reviews it separately, which can take up to two weeks; the plugin can be published meanwhile. Answers below match [PRIVACY.md](../../PRIVACY.md) and the code.

**1. Do you host a backend service for your plugin or widget?**
No. The plugin has no servers. Everything runs in the plugin window and talks only to Figma's API.

*1b and 1c (vulnerability process, security accreditations) apply only to a hosted backend, so they don't apply.*

**2. Does your plugin or widget make network requests with services you don't host?**
Yes: only Figma's own REST API, at `https://api.figma.com`, or `https://api.figma-gov.com` for files on Figma for Government. The manifest's `networkAccess` allows those two domains and nothing else, and every request uses HTTPS. The Plugin API has no way to read or post comments, so the plugin uses the REST API to read the comments on the file being copied from and the file being copied to, post the copies, and remove copies if an import is undone. To pin each copy, it sends Figma the node ID and position of the frame in the open file. All of this goes only to Figma.

**3. Does your plugin or widget have user authentication?**
No user accounts. To call Figma's REST API, the user pastes a Figma personal access token they make in their own Figma settings. The setup screen asks for the smallest scopes: `file_comments:read` to export, and `file_comments:read` plus `file_comments:write` to import, with a 1-day expiration.

**3b. Describe how you keep user credentials secure.**
The token is kept only in memory while the plugin window is open, and sent only in the `X-Figma-Token` header of HTTPS requests to Figma's API. It's never stored. Closing the window discards it, and the plugin deletes any token an earlier version saved. The plugin has no authentication service of its own.

**4. Do you store any data read or derived from Figma's plugin or widget API?**
No. The only thing stored is one setting in Figma's `clientStorage`: whether the user chose **Don't show this again** on the setup screen. It contains nothing from the file. **Export** downloads a `.json` file to the user's own device with the comments, the file's name, and the names of the layers and pages comments are pinned to. The plugin doesn't keep or send that file; the user chooses it again for **Import**.

*4b and 4c (where data is stored outside Figma, and who can access it) don't apply.*

**5. How do you manage updates to your plugin?**
The source is public at https://github.com/danbrady/figma-copy-comments. Changes go through pull requests, and the main branch requires typecheck, lint, unit tests on Node 20, 22, and 24, and a visual QA check of every screen and message to pass before a change merges. Updates are published through Figma Community, so Figma reviews the plugin before it's listed and reviews material updates again.

---

## 4. Add the final details

| Field | What to enter |
|---|---|
| **Publish to** | **Community.** Only shown on Organization and Enterprise plans; the other choice, Organization, publishes privately and can't reach files in other organizations |
| **Publish as** | A team or organization profile, or yourself. A team or organization profile keeps the plugin with the team if people change |
| **Support contact** *(required)* | `https://github.com/danbrady/figma-copy-comments/issues`. If the form requires an email address, enter one you check: it's shown on the listing |
| **Network access** | Nothing to enter. It should read **Restricted**, from the two domains in `manifest.json`. If it reads Unknown or Unrestricted, stop and check the manifest |
| **Additional contributors** | Optional |
| **Comments** | Your choice. Community comments are public; GitHub issues stay the support channel either way |
| **Sell this resource on Community** | Leave off. The plugin is free |

Then click **Publish**. The plugin shows **In review**, and Figma emails the decision to the publishing account.

---

## If a reviewer asks

**Why is this a Community plugin, not a private organization plugin?** It's for anyone who copies files between Figma accounts or organizations, and the two files are often in different organizations. A plugin published privately to one organization can't run in another, so a Community listing is the only way to use the same plugin on both sides.

**Why personal access tokens instead of OAuth?** Copying comments is usually a one-time job, often across two accounts. A token made with the smallest scopes and a 1-day expiration fits that, needs no server, and is never stored. Figma's OAuth apps exchange codes for tokens with a client secret, which would mean running a backend to keep it, and the plugin deliberately has none.
