// Pure helpers that decide what counts as "the same site".
// No chrome.* calls here, so this file can be unit-tested in Node.

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const LABEL_RE = /^[a-z0-9_-]+$/;

/**
 * Lowercase, drop a trailing dot and a single leading "www.", then validate.
 * Returns the cleaned hostname, or null if it doesn't look like a website.
 */
function cleanHostname(hostname) {
  let host = hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);

  const labels = host.split('.');
  if (labels.length < 2) return null; // "localhost", "com", ""
  if (!labels.every((label) => LABEL_RE.test(label))) return null; // "[::1]", "a..b"
  return host;
}

/**
 * Turn whatever the user typed into a bare domain.
 *   "YouTube.com"                      -> "youtube.com"
 *   "https://www.youtube.com:443/x?y"  -> "youtube.com"
 *   "chrome://extensions", "hello world", "" -> null
 */
export function normalize(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const withScheme = SCHEME_RE.test(trimmed) ? trimmed : `http://${trimmed}`;
  return hostFromUrl(withScheme);
}

/**
 * Domain for a tab URL, or null for pages that can't be blocked
 * (chrome://, file://, the new-tab page, extension pages, ...).
 */
export function hostFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return cleanHostname(parsed.hostname);
}

/**
 * Entries in `list` that block `host`: the host itself or any parent domain.
 *   findCovering("music.youtube.com", ["youtube.com"]) -> ["youtube.com"]
 *   findCovering("notyoutube.com",    ["youtube.com"]) -> []
 */
export function findCovering(host, list) {
  return list.filter((domain) => host === domain || host.endsWith(`.${domain}`));
}
