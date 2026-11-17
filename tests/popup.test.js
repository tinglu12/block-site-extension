// Loads popup.js with a fake `chrome` object and fake page elements, once
// per scenario, and checks what it shows and what it sends.

import { test } from 'node:test';
import assert from 'node:assert/strict';

let loadCount = 0;

async function openPopup({ url, list = [], reply = { ok: true } }) {
  const els = {};
  const sent = [];
  const navigations = [];
  const state = { closed: false, optionsOpened: 0 };

  globalThis.document = { getElementById: (id) => (els[id] ??= { hidden: id === 'error' }) };
  globalThis.window = { close: () => (state.closed = true) };
  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://ID/${path}`,
      sendMessage: async (message) => (sent.push(message), reply),
      openOptionsPage: () => state.optionsOpened++,
    },
    tabs: {
      query: async () => [{ id: 7, url }],
      update: async (id, { url: to }) => navigations.push([id, to]),
    },
    storage: { sync: { get: async () => ({ blocked: list }) } },
  };

  // The query string makes Node load a fresh copy of the module each time.
  await import(`../popup.js?${loadCount++}`);
  return { els, sent, navigations, state };
}

test('normal site: Block this site', async () => {
  const popup = await openPopup({ url: 'https://www.youtube.com/watch?v=1' });
  assert.equal(popup.els.site.textContent, 'youtube.com');
  assert.equal(popup.els.action.textContent, 'Block this site');
  assert.equal(popup.els.action.disabled, false);

  await popup.els.action.onclick();
  assert.deepEqual(popup.sent, [{ type: 'block', domain: 'youtube.com' }]);
  assert.deepEqual(popup.navigations, []);
  assert.equal(popup.state.closed, true);
});

test('block page: Unblock, then back to the original URL', async () => {
  const popup = await openPopup({
    url: 'chrome-extension://ID/blocked.html?url=https://m.youtube.com/watch?v=1&t=5',
    list: ['youtube.com'],
  });
  assert.equal(popup.els.status.textContent, 'Blocked');
  assert.equal(popup.els.site.textContent, 'm.youtube.com');

  await popup.els.action.onclick();
  assert.deepEqual(popup.sent, [{ type: 'unblock', host: 'm.youtube.com' }]);
  assert.deepEqual(popup.navigations, [[7, 'https://m.youtube.com/watch?v=1&t=5']]);
  assert.equal(popup.state.closed, true);
});

test("pages that can't be blocked: disabled button", async () => {
  for (const url of ['chrome://extensions', 'chrome://newtab/', 'chrome-extension://ID/blocked.html', '']) {
    const popup = await openPopup({ url });
    assert.equal(popup.els.action.disabled, true, url);
    assert.equal(popup.els.action.textContent, "Can't block this page");
  }
});

test('listed site that was not redirected: Unblock without navigating', async () => {
  const popup = await openPopup({ url: 'https://music.youtube.com/', list: ['youtube.com'] });
  assert.equal(popup.els.action.textContent, 'Unblock this site');
  await popup.els.action.onclick();
  assert.deepEqual(popup.navigations, []);
});

test('failure: shows the error and stays open', async () => {
  const popup = await openPopup({ url: 'https://reddit.com/', reply: { ok: false, error: 'boom' } });
  await popup.els.action.onclick();
  assert.equal(popup.state.closed, false);
  assert.equal(popup.els.error.hidden, false);
  assert.match(popup.els.error.textContent, /boom/);
  assert.equal(popup.els.action.disabled, false);
});

test('Manage blocked sites opens the list page', async () => {
  const popup = await openPopup({ url: 'chrome://newtab/' });
  popup.els.manage.onclick();
  assert.equal(popup.state.optionsOpened, 1);
  assert.equal(popup.state.closed, true);
});
