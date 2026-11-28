// Qodo's review of #160: the fixes for findings 1, 4, 5, 6, 7, 11 and 12
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanName, validPeerMeta } from '../web/check.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
const net = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');
const glyph = readFileSync(new URL('../web/heap-a.js', import.meta.url), 'utf8');

test('1: the invite sheet fits a short phone and scrolls inside', () => {
  assert.match(css, /#invitebox \.sheet \{[^}]*max-height: calc\(100dvh - 12px\)/);
  assert.match(css, /#invitebox \.sheet \{[^}]*overflow-y: auto/);
});

test('4: other people’s names are cleaned as they arrive', () => {
  assert.match(net, /import \{[^}]*cleanName[^}]*\} from '\.\/check\.js'/);
  assert.match(net, /s\.peers\[key\] = \{ name: cleanName\(m\.name\) \|\| 'Someone'/);
});

test('5: a toast goes when its time is up (the landing does not hold it on screen)', () => {
  assert.match(css, /#toast\.in \{[^}]*animation: boing \.6s cubic-bezier\(\.2, \.8, \.3, 1\) backwards/);
});

test('6: a tap on the save pill under a photo counts as a tap on it', () => {
  assert.match(html, /const PILL_BELOW = 40;/);
  assert.match(html, /y <= py \+ p\.h \+ PILL_BELOW/);
});

test('7: the glyph is sized again when its screen shows, never while hidden', () => {
  assert.match(glyph, /new ResizeObserver\(/);
  assert.match(glyph, /if \(!r\.width \|\| !r\.height\) return false;/);
});

test('11: rounded shapes draw on browsers without roundRect', () => {
  assert.match(html, /function rr\(ctx, x, y, w, h, r\) \{/);
  assert.equal((html.match(/ctx\.roundRect\(/g) || []).length, 1, 'only inside the helper');
});

test('12: names keep the joiners some scripts and emoji need, and count what you see', () => {
  assert.equal(cleanName('می‌خواهم'), 'می‌خواهم', 'ZWNJ kept (Persian)');
  assert.equal(cleanName('👩‍👩‍👧'), '👩‍👩‍👧', 'ZWJ emoji kept');
  assert.equal(cleanName('Jo‮hn​'), 'John', 'direction overrides and zero-width spaces still go');
  assert.equal(cleanName('x'.repeat(30)), 'x'.repeat(20), 'twenty characters');
  assert.equal(cleanName('🍪'.repeat(25)), '🍪'.repeat(20), 'twenty emoji');
  assert.doesNotMatch(html, /<input id="yourname" maxlength="20"/, 'the box doesn’t cut emoji names short');
});

test('re-review of #160: a name of long emoji still fits what other devices accept, cut at a whole emoji', () => {
  const fam = '👩‍👩‍👧';   // one emoji, 8 code units
  const n = cleanName(fam.repeat(6));
  assert.equal(n, fam.repeat(5), 'five whole family emoji fit in 40 code units');
  assert.ok(validPeerMeta({ name: n, w: 390, h: 844, joinedAt: 1 }), 'other devices accept it');
  for (const s of ['🏳️‍🌈'.repeat(9), 'é'.repeat(30), 'می‌خواهم'.repeat(4)]) assert.ok(validPeerMeta({ name: cleanName(s), w: 390, h: 844, joinedAt: 1 }), s);
});
