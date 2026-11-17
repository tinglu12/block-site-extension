// Service worker. Two jobs:
//  1. Keep Chrome's redirect rules (declarativeNetRequest) in sync with the
//     block list in storage.
//  2. Handle "block" / "unblock" messages from the popup, block page and
//     list page. All list changes go through here so they can't race.

import { normalize, hostFromUrl, findCovering, blockedPageUrl } from './domains.js';
import { getList, setList, STORAGE_KEY } from './storage.js';

const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');

// Run tasks one at a time, in order. Without this, two quick changes could
// both read the old list, or two rule rebuilds could clash on rule ids.
let chain = Promise.resolve();
function serialized(task) {
  const run = chain.then(task);
  chain = run.catch(() => {}); // a failed task shouldn't block later ones
  return run;
}

/**
 * Replace all dynamic rules with one redirect rule per blocked domain.
 * Dynamic rules aren't synced between computers, so they're always
 * rebuilt from storage (which is). Call only from inside serialized().
 */
async function rebuildRules() {
  const list = await getList();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: list.map((domain, i) => ({
      id: i + 1,
      priority: 1,
      condition: {
        requestDomains: [domain], // also matches every subdomain
        regexFilter: '^(.*)$', // capture the whole URL...
        resourceTypes: ['main_frame'], // ...only for top-level page loads
      },
      action: {
        type: 'redirect',
        // ...and pass it to the block page so Unblock can send you back.
        redirect: { regexSubstitution: `${BLOCKED_PAGE}?url=\\1` },
      },
    })),
  });
}

async function block(rawDomain) {
  const domain = normalize(rawDomain);
  if (!domain) return { ok: false, error: 'invalid domain' };

  const list = await getList();
  if (findCovering(domain, list).length > 0) return { ok: true, alreadyBlocked: true };

  await setList([...list, domain]);
  await rebuildRules();

  // The rule only catches new page loads, so send tabs that are already
  // open on this site to the block page right away.
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const host = tab.url && hostFromUrl(tab.url);
    if (host && findCovering(host, [domain]).length > 0) {
      chrome.tabs.update(tab.id, { url: blockedPageUrl(BLOCKED_PAGE, tab.url) });
    }
  }
  return { ok: true };
}

async function unblock(rawHost) {
  const host = normalize(rawHost);
  if (!host) return { ok: false, error: 'invalid domain' };

  // Remove every entry that blocks this host (e.g. both "youtube.com" and
  // "music.youtube.com"), otherwise it would still be blocked.
  const list = await getList();
  const covering = findCovering(host, list);
  await setList(list.filter((domain) => !covering.includes(domain)));
  // Rules are updated before we reply, so the caller can navigate to the
  // site without being redirected back to the block page.
  await rebuildRules();
  return { ok: true, removed: covering };
}

/**
 * Remove exactly one entry, as written in the list. Used by the list page:
 * clicking Unblock on "music.youtube.com" there shouldn't also delete a
 * separate "youtube.com" row the way unblock() would.
 */
async function remove(domain) {
  if (typeof domain !== 'string') return { ok: false, error: 'invalid domain' };
  const list = await getList();
  await setList(list.filter((entry) => entry !== domain));
  await rebuildRules();
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let task;
  if (message?.type === 'block') task = () => block(message.domain);
  else if (message?.type === 'unblock') task = () => unblock(message.host);
  else if (message?.type === 'remove') task = () => remove(message.domain);
  else return false; // not ours

  serialized(task)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // we'll call sendResponse asynchronously
});

// Rebuild the rules when the extension is installed or updated, when Chrome
// starts, and whenever the list changes (including edits synced from
// another computer).
chrome.runtime.onInstalled.addListener(() => serialized(rebuildRules));
chrome.runtime.onStartup.addListener(() => serialized(rebuildRules));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && STORAGE_KEY in changes) serialized(rebuildRules);
});
