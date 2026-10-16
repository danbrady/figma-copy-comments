---
layout: default
title: Setup and usage guide
description: How to copy comments from one Figma file to another with the Copy Comments plugin.
---

# Copy Comments

<p class="lede">A Figma plugin that copies comments from one Figma file to another, such as a duplicate, even when the two files belong to different Figma accounts.</p>

Duplicating a file, or saving it as a `.fig` and importing it, leaves its comments behind. Copy Comments brings them along: every thread and reply, pinned to the same frames, with the original author, time, resolved status, and reactions written into each comment.

<div class="cover wide"><img src="{{ '/images/cover.png' | relative_url }}" alt="Two Figma files, FROM and TO, with comment pins in the same places, and a pin moving from one to the other."></div>

**On this page:** [Before you start](#before-you-start) · [Export](#1-export) · [Make the copy](#2-make-the-copy) · [Import](#3-import) · [Undo an import](#undo-an-import) · [If something goes wrong](#if-something-goes-wrong) · [What gets copied](#what-gets-copied) · [Good to know](#good-to-know) · [FAQ](#faq) · [Help](#help)

## Before you start

Copy Comments works in the browser and in the desktop app. It uses Figma's API, so it needs a **personal access token** from you. A token only works for the account that made it. If one account can open both files, one token is enough; otherwise, make one in each account.

To make a token in Figma:

1. Go to **Home › [Your Name] › Settings › Security › Generate new token** ([Figma's guide](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens)).
2. Name it "Copy Comments" and set **Expiration** to 1 day. That's enough for a one-time copy.
3. Turn on only the permission scopes in the table below, and leave every other scope off.
4. Copy the token right away; Figma shows it only once. The plugin never saves it, so you paste it each time you open the plugin. Treat tokens like passwords.

| Token | Make it with | Scopes |
|---|---|---|
| Export | an account that can open the file you're copying FROM | `file_comments:read` |
| Import | an account that can comment on the file you're copying TO | `file_comments:read` and `file_comments:write` |

Using one token for both? Give it the Import token's scopes.

The plugin also shows these steps the first time it opens. To see them again, click **Token setup guide** next to either token field.

<div class="note" markdown="1">
**Who should run Import:** copied comments are posted under the name of whoever runs Import, and that person needs a **Full or Dev seat** where the file you're copying TO lives. Figma limits how fast each account can use its API, and View and Collab seats get the lowest limit ([rate limits](https://developers.figma.com/docs/rest-api/rate-limits)). The plugin posts about 40 comments a minute, so 500 comments take about 15 minutes.
</div>

## 1. Export

In the file you're copying **FROM**:

1. Choose **Plugins › Copy Comments**. It opens on the **Export** tab.
2. Paste the file's link (**Share › Copy link**) and your Export token.
3. Click **Export comments**. A file named `<file name> - comments.json` downloads. Keep it for the next steps.

<figure class="wide"><img src="{{ '/images/carousel-1-export.png' | relative_url }}" alt="The Export tab after a successful export, showing the number of threads, replies, and resolved threads saved." loading="lazy"></figure>

## 2. Make the copy

Duplicate the file you're copying FROM, or choose **File › Save local copy…** and import the `.fig` where you want the copy. If the copy already exists, skip this step.

## 3. Import

In the file you're copying **TO**:

1. Choose **Plugins › Copy Comments** and switch to the **Import** tab.
2. Paste that file's link and your Import token.
3. Choose the `.json` file from Export.
4. Optional:
   - Tick **Skip resolved threads** to leave out resolved threads and their replies.
   - Tick **Skip threads whose frame was deleted** to leave out threads pinned to frames that were deleted before the export. Otherwise they're placed near the top-left of the canvas. In long-lived files these are often most of the old threads.
5. Click **Preview** and check the numbers. Preview skips comments that were already copied, and checks that the link is for the file that's open.
6. Click **Post comments**, and keep the window open until it says **Import complete**.

<figure class="wide"><img src="{{ '/images/carousel-2-import.png' | relative_url }}" alt="The Import tab after Preview, ready to post 216 comments, with a summary of threads, replies, and skipped comments." loading="lazy"></figure>

## Undo an import

To take the copied comments back out of the file you're copying TO:

1. Open that file, choose **Plugins › Copy Comments**, and switch to the **Import** tab.
2. Paste the file's link and your Import token. You don't need the `.json` file.
3. Click **Remove copied comments from this file…**. The plugin counts the copied comments and says who posted them. Nothing is removed yet.
4. Click the red **Remove** button to confirm, or **Cancel**. Keep the window open until it says **Copied comments removed**.

Figma only lets people delete their own comments, so the plugin removes the copies posted by your token's owner and leaves everything else: regular comments and other people's copies. Removing can't be undone; run Import again to put the comments back.

Restoring an earlier version from the file's version history doesn't remove comments, because Figma doesn't keep comments in version history.

## If something goes wrong

- **Something failed partway:** click **Preview**, then **Post comments** again. Comments that were already copied are skipped, so nothing is posted twice.
- **A comment seems to be missing:** before reporting one as missing, the plugin checks the file again for up to 15 seconds, because Figma can take a moment to list new comments.
- **A reply is under the wrong thread:** Preview and the final message say so and list which ones. Figma can't move a reply, so delete it, then run **Preview** and **Post comments** again to post it in the right thread.
- **"Don't run Import again on this file":** don't. Figma changed some comments so much when saving them that a re-run can't recognize them and would post them twice. The message lists them so you can check they read correctly.
- **"You're offline" or "Could not reach Figma's API":** every step needs an internet connection. Reconnect, or ask your IT team whether your network blocks `api.figma.com`.
- **"Figma didn't accept the token (401)":** the token was mistyped, cut short when you pasted it, expired, or deleted. Paste it again, or make a new one.
- **"Figma refused the request (403)":** check that the token was made by an account that can open the file, hasn't expired, and has the scopes in the table above.

## What gets copied

Every thread and reply is posted in the file you're copying TO, in its original order. Each starts with a label, then the original text, then its details:

```
[Copied comment]
Original comment text
———
alex.rivera · Oct 1, 2026, 9:52:14 AM ET
✅ Resolved Oct 1, 2026, 1:20:05 PM ET
Reactions: :+1: ×3 (A. Lee, B. Ortiz, C. Kim)
```

Open threads have no Resolved line, and replies start with `[Copied reply]`. Times are Eastern.

<figure class="wide"><img src="{{ '/images/carousel-3-result.png' | relative_url }}" alt="A copied thread in Figma, pinned to the same frame, with the original author, time, resolved status, and reactions in its text." loading="lazy"></figure>

- **Position:** each comment is pinned to the same frame and spot, or the same canvas spot or region. If a frame can't be found, the comment goes near its old position and a `Location:` line says where it used to be.
- **Who and when:** Figma's API always posts as the person running Import, at the current time. The original author and time are in the text.
- **Not copied:**
  - the resolved state itself: Figma's API can't resolve comments, so every copied thread shows as open, and a resolved one says ✅ Resolved and when in its text
  - who resolved a thread
  - images and attachments in comments
  - live @mentions: they're posted as text, which Figma may turn back into a live mention when it saves the comment
- **Safe to re-run:** the plugin recognizes comments it already copied and skips them, so two people can work on the same file, or you can retry after an error, without creating duplicates. Export each original file once and reuse that export file for every Import.

## Good to know

**Notifications.** Posting hundreds of comments may notify people who follow the file you're copying TO. Figma groups its emails, sending them every 30 minutes, and also shows in-app notifications ([notification settings](https://help.figma.com/hc/en-us/articles/360041547813-Adjust-comment-notification-settings)). People @mentioned in the copied text may be notified too. Preview tells you how many comments mention someone. Tell the people who work on the file before you run Import.

**The exported file.** The `.json` holds every comment's text, the authors' Figma handles, and the names of the frames comments are pinned to. Treat it like the design file: keep it out of public channels, and delete it once the copied comments are checked.

**Your data.** The plugin only talks to Figma's API. It has no servers, collects no analytics, and never saves your token. The [privacy policy]({{ '/privacy/' | relative_url }}) lists everything it reads and keeps.

**For admins.** If your organization only allows approved plugins, an admin approves Copy Comments from its Community page under **Admin › Resources › Plugins › Add plugin** ([Manage plugins](https://help.figma.com/hc/en-us/articles/4404228724759-Manage-plugins-and-widgets-in-an-organization)). If the two files are in different organizations, do this in each. On restricted networks, allow `api.figma.com` (and `api.figma-gov.com` for Figma for Government) on port 443.

## FAQ

### Can I copy comments between different accounts or organizations?

Yes. Export with a token from an account that can open the original file, and Import with a token from an account that can comment on the copy. See [Before you start](#before-you-start).

### Why does it need a personal access token?

Figma's plugin API can't read or post comments. Figma's REST API can, and it needs a token to know which account is asking.

### Is my token saved or shared?

No. The plugin keeps it in memory only while its window is open and sends it only to Figma's API. Closing the window discards it. See the [privacy policy]({{ '/privacy/' | relative_url }}).

### Why are copied comments posted under my name?

Figma's API always posts as the account that owns the token, at the current time. That's why each copied comment has the original author and time written into its text.

### Why do resolved threads show as open?

Figma's API can't resolve comments, so every copied thread starts open. A thread that was resolved says ✅ Resolved and when in its text. To leave resolved threads out, tick **Skip resolved threads** before Preview.

### Will people be notified?

People who follow the file you're copying to may be, and so may people @mentioned in the copied text. Preview says how many comments mention someone. See [Good to know](#good-to-know).

### How long does it take?

About 40 comments a minute, so 500 comments take about 15 minutes. If the person running Import has a View or Collab seat, Figma limits their account much more, so it can take far longer. Keep the plugin window open until it finishes.

### Can I run Import again, or pick up after it stops?

Yes. Click **Preview**, then **Post comments** again. Comments that were already copied are skipped, so nothing is posted twice.

### Can I undo an import?

Yes. **Remove copied comments from this file…** on the Import tab removes the copies posted by your token's owner. See [Undo an import](#undo-an-import).

### What happens to comments already in the file I'm copying to?

Nothing. The plugin never changes or removes them. Removing copied comments only touches copies the plugin posted.

### Can I copy only some of the comments?

Only with the two skip options: **Skip resolved threads** and **Skip threads whose frame was deleted**. You can't pick comments by page or frame.

### Are images and attachments copied?

No. Only the text is copied, along with the details the plugin writes into it.

### Does it work with branches, FigJam, or Figma for Government?

Branches: yes, paste the branch's link. Figma for Government: yes, with a token made there. FigJam and Slides: no, Copy Comments works in Figma Design files only.

## Help

To ask a question or report a problem, [open an issue on GitHub](https://github.com/{{ site.repository }}/issues). Please don't include tokens, comment text, or file links in an issue.
