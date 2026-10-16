# Copy Comments privacy policy

Effective October 16, 2026

Copy Comments is a Figma plugin that copies comments from one Figma file to another. This policy explains what the plugin reads, where that data goes, and what it keeps.

**In short:** the plugin talks only to Figma. It has no servers, collects no analytics, and sends nothing to the publisher or anyone else. Your token is never saved.

## What the plugin reads

- **Your personal access token.** You paste it into the plugin each time you use it. The plugin keeps it in memory only while the plugin window is open, and sends it only to Figma's API, to read, post, or remove comments. Closing the window discards it. The plugin never saves it. If an earlier version of the plugin saved a token on your device, the plugin deletes it the next time it opens.
- **Comments.** On **Export**, the plugin reads the comments on the file you're copying from through Figma's API: their text, replies, authors' Figma handles and profile details, times, resolved state, reactions, and where they're pinned. On **Import**, it reads the comments already on the file you're copying to, so it can skip ones that were already copied.
- **Layer names in the open file.** To pin copied comments to the right frames, the plugin reads the names, types, and positions of the layers comments are pinned to, the names of the layers that contain them, and the names of their pages.

## Where data goes

- **Figma's API only.** The plugin sends requests only to `api.figma.com`, or `api.figma-gov.com` for files on Figma for Government. The plugin's manifest blocks every other address, so Figma won't let it contact anything else.
- **The exported file.** **Export** saves a `.json` file to your device. It contains the comments listed above, the name of the file they came from, and the layer and page names they're pinned to. It's saved only on your device, and the plugin doesn't send it anywhere. **Import** reads it from your device when you choose it. Treat it like the design file: share it only with people who can see that file, and delete it once the copied comments are checked.
- **Copied comments.** **Import** posts comments to the file you're copying to, under the name of the account that made your token. They're stored by Figma like any other comment, and everyone who can open that file can see them. Figma's own [privacy policy](https://www.figma.com/legal/privacy/) covers how Figma handles them.

## What the plugin keeps on your device

One setting: whether you chose **Don't show this again** on the setup screen. It's saved in Figma's plugin storage on your device and contains no personal data.

## What the plugin doesn't do

- It doesn't save tokens, comments, or file contents, except for the export file you download.
- It doesn't use analytics, tracking, cookies, or ads.
- It doesn't send data to the publisher or to any service other than Figma.
- It doesn't read the contents of the open file: only the names, types, and positions above, to find where comments are pinned.

## Removing data

- **Token:** close the plugin window. To revoke the token itself, delete it in Figma under **Settings › Security › Personal access tokens**.
- **Export file:** delete it from your device.
- **Copied comments:** use **Remove copied comments from this file…** on the **Import** tab, or delete them in Figma.
- **The setup-screen setting:** click **Token setup guide**, untick **Don't show this again**, and continue.

## Changes and contact

If this policy changes, the effective date above will change too. For questions, open an issue at [github.com/danbrady/figma-copy-comments/issues](https://github.com/danbrady/figma-copy-comments/issues).
