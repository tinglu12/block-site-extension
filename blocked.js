// Block page. Blocked sites are redirected here as
//   blocked.html?url=<the URL you were trying to visit>
// It shows which site is blocked and lets you unblock it and carry on.

import { hostFromUrl, originalUrlFromBlockedPage } from './domains.js';

const titleEl = document.getElementById('title');
const urlEl = document.getElementById('url');
const button = document.getElementById('unblock');
const errorEl = document.getElementById('error');

document.getElementById('manage').onclick = () => chrome.runtime.openOptionsPage();

const originalUrl = originalUrlFromBlockedPage(location.href);
const host = originalUrl && hostFromUrl(originalUrl);

// No usable ?url= (opened directly, or a garbled link): keep the generic
// "This site is blocked" heading and leave the button hidden.
if (host) {
  titleEl.textContent = `${host} is blocked`;
  document.title = `${host} is blocked`;
  urlEl.textContent = originalUrl;
  urlEl.hidden = false;
  button.hidden = false;
  button.onclick = unblock;
}

async function unblock() {
  button.disabled = true;
  errorEl.hidden = true;
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'unblock', host });
    if (!reply?.ok) throw new Error(reply?.error ?? 'no reply');
    // The reply only arrives once the redirect rule is gone, so this won't
    // bounce back here. replace() (not assign) keeps the block page out of
    // history, so Back doesn't land on it.
    location.replace(originalUrl);
  } catch (err) {
    errorEl.textContent = `Something went wrong: ${err.message}`;
    errorEl.hidden = false;
    button.disabled = false;
  }
}
