// Loads blocked.js with a fake `chrome`, `location` and page elements.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const PAGE = 'chrome-extension://ID/blocked.html';
let loadCount = 0;

async function openBlockPage(href, reply = { ok: true }) {
  const els = {};
  const sent = [];
  const replacedWith = [];
  const state = { optionsOpened: 0 };

  globalThis.document = {
    title: 'Site blocked',
    getElementById: (id) => (els[id] ??= { hidden: true, textContent: '' }),
  };
  globalThis.location = { href, replace: (url) => replacedWith.push(url) };
  globalThis.chrome = {
    runtime: {
      sendMessage: async (message) => (sent.push(message), reply),
      openOptionsPage: () => state.optionsOpened++,
    },
  };

  await import(`../blocked.js?${loadCount++}`);
  return { els, sent, replacedWith, state };
}

test('shows the blocked site and original URL', async () => {
  const page = await openBlockPage(`${PAGE}?url=https://www.youtube.com/watch?v=abc&t=5`);
  assert.equal(page.els.title.textContent, 'youtube.com is blocked');
  assert.equal(globalThis.document.title, 'youtube.com is blocked');
  assert.equal(page.els.url.textContent, 'https://www.youtube.com/watch?v=abc&t=5');
  assert.equal(page.els.unblock.hidden, false);
});

test('Unblock sends the message, then returns to the original URL', async () => {
  const page = await openBlockPage(`${PAGE}?url=https://www.youtube.com/watch?v=abc&t=5`);
  await page.els.unblock.onclick();
  assert.deepEqual(page.sent, [{ type: 'unblock', host: 'youtube.com' }]);
  assert.deepEqual(page.replacedWith, ['https://www.youtube.com/watch?v=abc&t=5']);
});

test('missing or unsafe ?url= hides the Unblock button', async () => {
  for (const href of [PAGE, `${PAGE}?url=`, `${PAGE}?url=javascript:alert(1)`]) {
    const page = await openBlockPage(href);
    assert.equal(page.els.unblock.hidden, true, href);
  }
});

test('failure: shows the error and stays on the page', async () => {
  const page = await openBlockPage(`${PAGE}?url=https://reddit.com/`, { ok: false, error: 'boom' });
  await page.els.unblock.onclick();
  assert.deepEqual(page.replacedWith, []);
  assert.match(page.els.error.textContent, /boom/);
  assert.equal(page.els.unblock.disabled, false);
});

test('See all blocked sites opens the list page', async () => {
  const page = await openBlockPage(PAGE);
  page.els.manage.onclick();
  assert.equal(page.state.optionsOpened, 1);
});
