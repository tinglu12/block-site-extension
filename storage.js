// The block list lives in chrome.storage.sync under one key, as a sorted
// array of domains, e.g. ["reddit.com", "youtube.com"].

export const STORAGE_KEY = 'blocked';

export async function getList() {
  const { [STORAGE_KEY]: list } = await chrome.storage.sync.get(STORAGE_KEY);
  return Array.isArray(list) ? list : [];
}

/** Save the list de-duplicated and sorted. Returns what was saved. */
export async function setList(list) {
  const clean = [...new Set(list)].sort();
  await chrome.storage.sync.set({ [STORAGE_KEY]: clean });
  return clean;
}
