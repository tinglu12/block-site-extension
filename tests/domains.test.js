import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, hostFromUrl, findCovering } from '../domains.js';

test('normalize: plain domains', () => {
  assert.equal(normalize('youtube.com'), 'youtube.com');
  assert.equal(normalize('  YouTube.COM  '), 'youtube.com');
  assert.equal(normalize('music.youtube.com'), 'music.youtube.com');
  assert.equal(normalize('bbc.co.uk'), 'bbc.co.uk');
});

test('normalize: strips www, scheme, port, path, query, trailing dot', () => {
  assert.equal(normalize('www.youtube.com'), 'youtube.com');
  assert.equal(normalize('https://www.YouTube.com:443/watch?v=abc#t=1'), 'youtube.com');
  assert.equal(normalize('http://reddit.com/r/foo'), 'reddit.com');
  assert.equal(normalize('reddit.com:8080/r/foo'), 'reddit.com');
  assert.equal(normalize('youtube.com.'), 'youtube.com');
});

test('normalize: only strips one leading www', () => {
  assert.equal(normalize('www.www.example.com'), 'www.example.com');
  assert.equal(normalize('wwwexample.com'), 'wwwexample.com');
});

test('normalize: rejects junk', () => {
  for (const bad of ['', '   ', 'hello world', 'localhost', 'www.com', 'a..b', 'chrome://extensions',
    'file:///home/me/x.html', 'ftp://example.com', 'http://[::1]/', null, undefined, 42]) {
    assert.equal(normalize(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('hostFromUrl: web pages', () => {
  assert.equal(hostFromUrl('https://www.youtube.com/watch?v=abc'), 'youtube.com');
  assert.equal(hostFromUrl('http://m.youtube.com/'), 'm.youtube.com');
});

test('hostFromUrl: pages that cannot be blocked', () => {
  for (const url of ['chrome://extensions', 'chrome://newtab/', 'about:blank', 'file:///tmp/a.html',
    'chrome-extension://abcdef/blocked.html?url=https://x.com', 'not a url', '']) {
    assert.equal(hostFromUrl(url), null, `expected null for ${url}`);
  }
});

test('findCovering: exact match and parent domains', () => {
  const list = ['youtube.com', 'reddit.com', 'music.youtube.com'];
  assert.deepEqual(findCovering('youtube.com', list), ['youtube.com']);
  assert.deepEqual(findCovering('m.youtube.com', list), ['youtube.com']);
  assert.deepEqual(findCovering('music.youtube.com', list), ['youtube.com', 'music.youtube.com']);
});

test('findCovering: lookalike domains are not covered', () => {
  const list = ['youtube.com'];
  assert.deepEqual(findCovering('notyoutube.com', list), []);
  assert.deepEqual(findCovering('youtube.com.evil.net', list), []);
  assert.deepEqual(findCovering('com', list), []);
});

test('findCovering: subdomain entry does not cover the parent', () => {
  assert.deepEqual(findCovering('youtube.com', ['music.youtube.com']), []);
});
