// Toolbar popup. Looks at the current tab and shows one of three states:
//   - on a normal website        -> "Block"
//   - on our block page          -> "Unblock", then go back to the original URL
//   - on chrome://, new tab, ... -> disabled "Can't block this page"

import { hostFromUrl, findCovering, originalUrlFromBlockedPage } from './domains.js';
import { getList } from './storage.js';

const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');

const statusEl = document.getElementById('status');
const siteEl = document.getElementById('site');
const button = document.getElementById('action');
const errorEl = document.getElementById('error');

function showBlock(host) {
  statusEl.textContent = 'Current site';
  siteEl.textContent = host;
  button.textContent = 'Block this site';
  button.className = 'block';
  button.disabled = false;
  button.onclick = () => run({ type: 'block', domain: host });
}

/** `returnTo`: URL to load after unblocking, or null to stay put. */
function showUnblock(host, returnTo) {
  statusEl.textContent = 'Blocked';
  siteEl.textContent = host;
  button.textContent = 'Unblock this site';
  button.className = '';
  button.disabled = false;
  button.onclick = () => run({ type: 'unblock', host }, returnTo);
}

function showCantBlock() {
  statusEl.textContent = 'Current page';
  siteEl.textContent = 'Not a website';
  button.textContent = "Can't block this page";
  button.className = '';
  button.disabled = true;
}

/** Ask the background to block/unblock, then optionally navigate the tab. */
async function run(message, returnTo = null) {
  button.disabled = true;
  errorEl.hidden = true;
  try {
    const reply = await chrome.runtime.sendMessage(message);
    if (!reply?.ok) throw new Error(reply?.error ?? 'no reply');
    // Only navigate after the reply: by then the redirect rule is gone,
    // so we won't bounce straight back to the block page.
    if (returnTo) await chrome.tabs.update(tab.id, { url: returnTo });
    window.close();
  } catch (err) {
    errorEl.textContent = `Something went wrong: ${err.message}`;
    errorEl.hidden = false;
    button.disabled = false;
  }
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const url = tab?.url ?? '';

if (url.startsWith(BLOCKED_PAGE)) {
  // On our block page: unblock the original site and go back to it.
  const original = originalUrlFromBlockedPage(url);
  const host = original && hostFromUrl(original);
  if (host) showUnblock(host, original);
  else showCantBlock();
} else {
  const host = hostFromUrl(url);
  if (!host) {
    showCantBlock();
  } else if (findCovering(host, await getList()).length > 0) {
    // Rare: the site is on the list but this tab wasn't redirected
    // (e.g. it was blocked from another computer and hasn't reloaded).
    showUnblock(host, null);
  } else {
    showBlock(host);
  }
}
