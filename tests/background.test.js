// Runs background.js against a fake `chrome` object: storage, redirect
// rules and tabs are plain in-memory values we can inspect.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
let rules = [];
const navigations = []; // [tabId, url] for every chrome.tabs.update
const tabs = [
  { id: 1, url: 'https://www.youtube.com/watch?v=abc' },
  { id: 2, url: 'https://m.youtube.com/' },
  { id: 3, url: 'https://notyoutube.com/' },
  { id: 4, url: 'chrome://extensions' },
];
let onMessage;
const onChanged = [];

globalThis.chrome = {
  runtime: {
    getURL: (path) => `chrome-extension://ID/${path}`,
    onMessage: { addListener: (fn) => (onMessage = fn) },
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
  },
  storage: {
    sync: {
      get: async (key) => (key in store ? { [key]: store[key] } : {}),
      set: async (items) => {
        Object.assign(store, items);
        const changes = Object.fromEntries(Object.keys(items).map((k) => [k, {}]));
        for (const fn of onChanged) fn(changes, 'sync');
      },
    },
    onChanged: { addListener: (fn) => onChanged.push(fn) },
  },
  declarativeNetRequest: {
    getDynamicRules: async () => rules,
    updateDynamicRules: async ({ removeRuleIds, addRules }) => {
      const kept = rules.filter((rule) => !removeRuleIds.includes(rule.id));
      for (const rule of addRules) {
        if (kept.some((k) => k.id === rule.id)) throw new Error(`duplicate rule id ${rule.id}`);
      }
      rules = [...kept, ...addRules];
    },
  },
  tabs: {
    query: async () => tabs,
    update: (id, { url }) => navigations.push([id, url]),
  },
};

await import('../background.js');

/** Send a message the way another extension page would, and get the reply. */
function send(message) {
  return new Promise((resolve) => {
    const keepOpen = onMessage(message, {}, resolve);
    assert.equal(keepOpen, true, 'listener must return true for async replies');
  });
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const ruleDomains = () => rules.map((rule) => rule.condition.requestDomains[0]);

test('block: saves the domain and adds a redirect rule', async () => {
  assert.deepEqual(await send({ type: 'block', domain: 'https://www.YouTube.com/x' }), { ok: true });
  assert.deepEqual(store.blocked, ['youtube.com']);
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].condition.resourceTypes, ['main_frame']);
  assert.equal(rules[0].action.redirect.regexSubstitution, 'chrome-extension://ID/blocked.html?url=\\1');
});

test('block: sends already-open tabs on that site (and subdomains) to the block page', () => {
  assert.deepEqual(navigations, [
    [1, 'chrome-extension://ID/blocked.html?url=https://www.youtube.com/watch?v=abc'],
    [2, 'chrome-extension://ID/blocked.html?url=https://m.youtube.com/'],
  ]);
});

test('block: already-covered and invalid domains', async () => {
  assert.deepEqual(await send({ type: 'block', domain: 'music.youtube.com' }), { ok: true, alreadyBlocked: true });
  assert.deepEqual(await send({ type: 'block', domain: 'junk' }), { ok: false, error: 'invalid domain' });
  assert.deepEqual(store.blocked, ['youtube.com']);
});

test('block: two at once are both saved, with no rule id clash', async () => {
  await Promise.all([send({ type: 'block', domain: 'reddit.com' }), send({ type: 'block', domain: 'x.com' })]);
  await settle();
  assert.deepEqual(store.blocked, ['reddit.com', 'x.com', 'youtube.com']);
  assert.deepEqual(ruleDomains(), ['reddit.com', 'x.com', 'youtube.com']);
});

test('unblock: removes every entry that covers the site', async () => {
  store.blocked = ['music.youtube.com', 'reddit.com', 'x.com', 'youtube.com'];
  const reply = await send({ type: 'unblock', host: 'music.youtube.com' });
  assert.deepEqual(reply, { ok: true, removed: ['music.youtube.com', 'youtube.com'] });
  assert.deepEqual(store.blocked, ['reddit.com', 'x.com']);
  assert.deepEqual(ruleDomains(), ['reddit.com', 'x.com'], 'rules updated before the reply');
});

test('remove: deletes exactly one row', async () => {
  store.blocked = ['music.youtube.com', 'reddit.com', 'youtube.com'];
  assert.deepEqual(await send({ type: 'remove', domain: 'music.youtube.com' }), { ok: true });
  assert.deepEqual(store.blocked, ['reddit.com', 'youtube.com']);
  assert.deepEqual(ruleDomains(), ['reddit.com', 'youtube.com']);
  assert.deepEqual(await send({ type: 'remove', domain: 42 }), { ok: false, error: 'invalid domain' });
});

test('ignores message types it does not handle', () => {
  assert.equal(onMessage({ type: 'something-else' }, {}, () => {}), false);
});
