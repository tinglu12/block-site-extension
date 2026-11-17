// Block page. Phase 2: just say which site is blocked.
// (The Unblock button comes in Phase 4.)

import { hostFromUrl, originalUrlFromBlockedPage } from './domains.js';

const originalUrl = originalUrlFromBlockedPage(location.href);
const host = originalUrl && hostFromUrl(originalUrl);

if (host) {
  document.getElementById('message').textContent = `${host} is blocked`;
  document.title = `${host} is blocked`;
}
