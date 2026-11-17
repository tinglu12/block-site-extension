// Loads list.js with a fake `chrome` object and a tiny fake DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Just enough of a DOM element for list.js. */
function fakeElement() {
  const listeners = {};
  const classes = new Set();
  return {
    hidden: false, textContent: '', value: '', disabled: false, className: '', children: [],
    classes,
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
    addEventListener: (type, fn) => (listeners[type] = fn),
    fire: (type, event = {}) => listeners[type](event),
    replaceChildren(...kids) { this.children = kids; },
    append(...kids) { this.children.push(...kids); },
    focus() {},
  };
}

const els = {};
let stored = ['reddit.com', 'youtube.com'];
let reply = { ok: true }; // or 'throw' to make sendMessage throw
const sent = [];
let storageChanged;

globalThis.document = {
  getElementById: (id) => (els[id] ??= fakeElement()),
  createElement: () => fakeElement(),
};
globalThis.chrome = {
  runtime: {
    sendMessage: async (message) => {
      sent.push(message);
      if (reply === 'throw') throw new Error('gone');
      return reply;
    },
  },
  storage: {
    sync: { get: async () => ({ blocked: stored }) },
    onChanged: { addListener: (fn) => (storageChanged = fn) },
  },
};

await import('../list.js');

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const rowNames = () => els.list.children.map((li) => li.children[0].textContent);
const rowButton = (i) => els.list.children[i].children[1];
const message = () => els['add-message'];
async function setStored(list) {
  stored = list;
  storageChanged({ blocked: {} }, 'sync');
  await settle();
}
async function submit(text) {
  els['add-input'].value = text;
  await els['add-form'].fire('submit', { preventDefault() {} });
}

test('shows the list', async () => {
  await settle();
  assert.deepEqual(rowNames(), ['reddit.com', 'youtube.com']);
  assert.equal(els.empty.hidden, true);
});

test('Unblock on a row removes exactly that domain', async () => {
  await rowButton(1).fire('click');
  assert.deepEqual(sent.at(-1), { type: 'remove', domain: 'youtube.com' });
});

test('redraws when storage changes, with an empty state', async () => {
  await setStored([]);
  assert.deepEqual(rowNames(), []);
  assert.equal(els.empty.hidden, false);
});

test('add: junk shows an error and sends nothing', async () => {
  const before = sent.length;
  await submit('hello world');
  assert.equal(sent.length, before);
  assert.equal(message().hidden, false);
  assert.equal(message().classes.has('info'), false);
});

test('add: a URL is cleaned up to a domain and blocked', async () => {
  await submit('https://www.Reddit.com/r/foo');
  assert.deepEqual(sent.at(-1), { type: 'block', domain: 'reddit.com' });
  assert.equal(els['add-input'].value, '');
});

test('add: an already-covered site shows a grey note and sends nothing', async () => {
  stored = ['youtube.com'];
  const before = sent.length;
  await submit('music.youtube.com');
  assert.equal(sent.length, before);
  assert.equal(message().textContent, 'music.youtube.com is already blocked (covered by youtube.com).');
  assert.equal(message().classes.has('info'), true);
});

test('failures show a message and re-enable the button', async () => {
  reply = { ok: false, error: 'boom' };
  await submit('x.com');
  assert.match(message().textContent, /Couldn't block x\.com: boom/);

  reply = 'throw';
  await setStored(['youtube.com']);
  await rowButton(0).fire('click');
  assert.equal(rowButton(0).disabled, false);
  assert.match(message().textContent, /Couldn't unblock youtube\.com: gone/);
});
