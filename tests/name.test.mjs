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
test('the home screen asks for your name above the two cards', () => {
  assert.match(html, /<label for="yourname">Your name<\/label>\s*<input id="yourname" maxlength="20" autocomplete="nickname"[^>]*>[\s\S]*<div id="choose">/);
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
