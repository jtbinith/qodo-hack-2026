// Your name (#156): people pick the name others see, instead of a random one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as check from '../web/check.js';

const clean = (s) => { assert.equal(typeof check.cleanName, 'function', 'check.js exports cleanName'); return check.cleanName(s); };

test('a name is trimmed and its inner spaces collapsed', () => {
  assert.equal(clean('  Jo   Anne  '), 'Jo Anne');
});
test('hidden control and format characters are removed', () => {
  assert.equal(clean('Jo\u0000‮hn​'), 'John');
  assert.equal(clean('a\nb\tc'), 'a b c');
});
test('a name is at most 20 characters, counting emoji as one', () => {
  assert.equal(clean('x'.repeat(30)), 'x'.repeat(20));
  assert.equal([...clean('🍪'.repeat(25))].length, 20);
});
test('an empty or all-space name is empty, and anything not a string too', () => {
  for (const v of ['', '   ', '​', null, undefined, 42, {}]) assert.equal(clean(v), '', String(v));
});
test('a cleaned name is always a valid peer name', () => {
  for (const s of ['Jo', 'x'.repeat(50), '🍪'.repeat(30)]) assert.ok(check.validPeerMeta({ name: clean(s), w: 400, h: 400, joinedAt: 1 }), s);
});

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const lobby = (html.match(/<div id="lobby">([\s\S]*?)<\/div>\s*<!-- \/lobby -->/) || [, ''])[1];
const part = (id) => (lobby.match(new RegExp(`<div[^>]*id="${id}"[^>]*>([\\s\\S]*?)<!-- \\/${id} -->`)) || [, ''])[1];
test('one step at a time: home, then the heap code, then your name (wireframes 1.1, 1.2, 1.4)', () => {
  assert.ok(part('s-home'), 'a home screen');
  assert.doesNotMatch(part('s-home'), /yourname|id="code"/, 'home has only Start and Join');
  assert.match(part('s-code'), /<button type="button" class="back"[^>]*>‹ Back<\/button>[\s\S]*<h2>Heap code<\/h2>[\s\S]*<form id="f"[\s\S]*<input id="code"/, 'a code screen with Back');
  assert.match(part('s-name'), /<button type="button" class="back"[^>]*>‹ Back<\/button>[\s\S]*<h2>What should others call you\?<\/h2>[\s\S]*<label for="yourname">Your name<\/label>\s*<input id="yourname" maxlength="80" autocomplete="nickname"[\s\S]*<button id="go">/, 'a name screen with Back');
  assert.match(lobby, /id="s-code"[^>]*hidden/); assert.match(lobby, /id="s-name"[^>]*hidden/);
});
test('no random names any more', () => {
  assert.doesNotMatch(html, /const NAMES = /);
  assert.match(html, /localStorage/, 'the name is remembered on this device');
  assert.match(html, /toast\('Add your name first'\)/);
});

test('the device check gives each window a name of its own, so invite links still join in one tap', () => {
  const gc = readFileSync(new URL('../scripts/group-check.mjs', import.meta.url), 'utf8');
  assert.match(gc, /addInitScript\(\(n\) => \{ try \{ if \(!localStorage\.getItem\('heap-name'\)\) localStorage\.setItem\('heap-name', n\); \} catch \{\} \}, `Device \$\{i\}`\)/);
});

test('the heap code is typed into 10 boxes in two groups of 5 (wireframe 1.2)', () => {
  const code = part('s-code');
  assert.match(code, /<div class="cells" aria-hidden="true">(\s*<span><\/span>){5}\s*<i>–<\/i>(\s*<span><\/span>){5}\s*<\/div>/, 'ten boxes, a dash after five');
  assert.match(code, /<input id="code" maxlength="10"[^>]*inputmode="text"/, 'one real field underneath, for paste and screen readers');
  assert.match(html, /function showCells\(\)/, 'the boxes mirror the field');
});
