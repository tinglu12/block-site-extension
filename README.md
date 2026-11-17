# Simple Site Blocker

A small Chrome extension for blocking distracting sites. Click the icon on any site and choose **Block this site**. To get back in, click **Unblock** on the block page, or remove the site from your list.

- One click to block the current site, including all its subdomains (`youtube.com` also blocks `m.youtube.com`, `music.youtube.com`, …).
- Blocked sites never load: you land on a block page that shows the site and the exact URL you were trying to open.
- Unblock from the block page and you go straight back to that URL.
- A list page shows every blocked site, lets you unblock any of them, and lets you add a site by typing it.
- Your list syncs across computers signed in to the same Chrome profile.
- No accounts, no tracking, no network requests. Plain HTML/CSS/JS with no build step.

## Install

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the repo folder.
4. Optional: pin the extension from the puzzle-piece menu so the icon is always in the toolbar.

**Make it work in incognito too:** on `chrome://extensions`, click **Details** on the extension and turn on **Allow in Incognito**. Otherwise an incognito window gets around every block.

Also works in other Chromium browsers (Edge, Brave, …) the same way.

## Use

| To… | Do this |
|---|---|
| Block the site you're on | Click the icon → **Block this site**. Any open tabs on that site switch to the block page. |
| Unblock while visiting it | Click **Unblock this site** on the block page (or in the popup). You go back to the page you wanted. |
| See or edit your list | Popup → **Manage blocked sites**, or the extension's **Details → Extension options**. |
| Block a site without visiting it | On the list page, type a domain or paste a URL (e.g. `reddit.com` or `https://www.reddit.com/r/foo`) and press Enter. |

What counts as "the site": `www.` is dropped and everything under the domain is included. Blocking on `www.youtube.com` blocks all of YouTube. Blocking on `music.youtube.com` blocks only that subdomain (and anything under it).

## How it works

- The list is stored in `chrome.storage.sync` under the key `blocked`.
- The background service worker turns the list into Chrome [`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) redirect rules, one per domain. Chrome applies them itself, so a blocked page never starts loading. The rules are rebuilt from the list on install, on browser start, and whenever the list changes (including changes synced from another computer).
- A rule redirects to `blocked.html?url=<original URL>`, which is how Unblock knows where to send you back.
- Every change to the list goes through the service worker one at a time, so quick clicks can't overwrite each other. An unblock waits for the rule to be removed before replying, so going back to the site can't bounce you onto the block page again.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension config and permissions |
| `background.js` | Service worker: block/unblock/remove messages, redirect rules |
| `domains.js` | Pure helpers: cleaning up domains, "does this entry cover that site?", block-page URLs |
| `storage.js` | Read and write the list |
| `popup.html` / `.css` / `.js` | Toolbar popup |
| `blocked.html` / `.css` / `.js` | Page shown instead of a blocked site |
| `list.html` / `.css` / `.js` | List page (the extension's options page) |
| `theme.css` | Shared colors (light and dark) and button styles |
| `icons/` | Toolbar and extension icons |
| `tests/` | Tests run in Node with a fake `chrome` object |

## Permissions

- `storage`: save your list.
- `declarativeNetRequest` + access to all sites: redirect blocked sites to the block page. Chrome requires site access for redirects.
- `tabs`: read the current tab's URL for the popup, and switch already-open tabs to the block page when you block a site.

## Tests

Requires Node.js 22 or later. No dependencies to install.

```sh
npm test
```

These cover the domain logic and run each page's script against a fake `chrome` object. They don't drive a real browser, so check changes by reloading the extension in Chrome too.

## Limitations

- Chrome and Chromium browsers only (Manifest V3).
- Only whole-page visits are blocked. Content from a blocked domain embedded in other sites (e.g. a YouTube video on a blog) still loads.
- There's no "root domain" detection: blocking on `music.youtube.com` doesn't block the rest of YouTube.
- It's meant to add friction, not to be tamper-proof. Disabling the extension removes all blocks.
