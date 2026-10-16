# Community listing copy

What to paste into Figma's **Publish to Community** form. The images are in this folder; see the README's **Publish and approve** step for which goes where.

## Name

Copy Comments

## Description

Copy every comment thread from one Figma file to another: a duplicate, a file you saved and imported again, or a copy in another team, organization, or Figma account. Duplicating a file leaves its comments behind; this brings them along.

**How it works**
1. **Export:** run the plugin in the original file. It saves every thread and reply to a .json file on your device.
2. **Import:** run it in the copy and choose that file. **Preview** shows what will be posted, then **Post comments** posts it.

**What you get**
- Comments pinned to the same frames and spots, with replies in order
- The original author, time, resolved status, and reactions written into each comment's text. Copies are posted under your name, because Figma's API always posts as the person running it.
- Safe to re-run: comments that were already copied are skipped
- An undo: **Remove copied comments** takes the copies back out

**What you need**
- **A Figma personal access token** for each account involved. Export needs the scope `file_comments:read`; Import needs `file_comments:read` and `file_comments:write`. The plugin shows you how to make one. It never saves your token, so you paste it each time.
- Permission to comment on the file you're copying to

**Good to know**
- People who follow the file you're copying to may be notified about the new comments, and people @mentioned in them may be notified too. **Preview** tells you how many comments mention someone before you post.
- Images and attachments in comments aren't copied. Copied threads show as open, because Figma's API can't resolve comments; a resolved thread says so in its text.
- The plugin only talks to Figma's API. It has no servers and collects no analytics.

Setup guide: [public link to the "For everyone" guide]
Privacy policy: [public link to PRIVACY.md]

## Tags

comments, copy, duplicate, migrate, handoff

## Note for reviewers

If the form asks why this is a Community plugin, not a private organization plugin: it's for anyone who copies files between Figma accounts or organizations, and the two files are often in different organizations. A plugin published privately to one organization can't run in another, so a Community listing is the only way to use the same plugin on both sides.

Network access: only `api.figma.com` and `api.figma-gov.com`, declared in the manifest. Tokens stay in memory while the window is open and are never stored. See PRIVACY.md.
