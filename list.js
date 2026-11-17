// List page (the extension's options page): see every blocked site, unblock
// any of them, or type a site to block it without visiting it.

import { normalize, findCovering } from './domains.js';
import { getList, STORAGE_KEY } from './storage.js';

const form = document.getElementById('add-form');
const input = document.getElementById('add-input');
const messageEl = document.getElementById('add-message');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');

/** Message the background; a thrown error comes back as a failed reply. */
async function send(message) {
  try {
    return (await chrome.runtime.sendMessage(message)) ?? { ok: false, error: 'no reply' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Show a line under the add box. kind: 'error' (red) or 'info' (grey). */
function showMessage(text, kind = 'error') {
  messageEl.textContent = text;
  messageEl.classList.toggle('info', kind === 'info');
  messageEl.hidden = false;
}

async function render() {
  const list = await getList();
  listEl.replaceChildren(...list.map(renderRow));
  emptyEl.hidden = list.length > 0;
}

function renderRow(domain) {
  // Built with textContent, never innerHTML, so a stored value can't inject markup.
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'domain';
  name.textContent = domain;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Unblock';
  button.addEventListener('click', async () => {
    button.disabled = true;
    const reply = await send({ type: 'remove', domain });
    // On success the row disappears when storage changes (see below).
    if (!reply.ok) {
      button.disabled = false;
      showMessage(`Couldn't unblock ${domain}: ${reply.error}`);
    }
  });

  li.append(name, button);
  return li;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault(); // stay on the page instead of submitting the form
  messageEl.hidden = true;

  const domain = normalize(input.value);
  if (!domain) {
    showMessage("That doesn't look like a website address. Try something like youtube.com.");
    return;
  }

  const covering = findCovering(domain, await getList());
  if (covering.length > 0) {
    const by = covering[0] === domain ? '' : ` (covered by ${covering[0]})`;
    showMessage(`${domain} is already blocked${by}.`, 'info');
    return;
  }

  const reply = await send({ type: 'block', domain });
  if (!reply.ok) {
    showMessage(`Couldn't block ${domain}: ${reply.error}`);
    return;
  }
  input.value = '';
  input.focus();
});

// Re-render whenever the list changes, whether from this page, the popup,
// the block page or another computer.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && STORAGE_KEY in changes) render();
});

render();
