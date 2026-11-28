// Qodo's review of #165: the fixes for all 15 findings
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSaveAll } from '../web/saveall.js';
import * as a11y from '../web/a11y.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

test('1: one deck’s Get all leaves other stuck shares held', async () => {
  let n = 0; const shared = [];
  const s = createSaveAll({
    batch: (handed, only) => ({ ready: ['a', 'b'].filter((p) => !handed.has(p) && (!only || only.has(p))).map((pid) => ({ pid, file: { name: pid } })), arriving: 0 }),
    canShare: () => true, share: (l) => { shared.push(l.map((f) => f.name)); n++; return new Promise(() => {}); }, download: () => {}, toast: () => {},
    wait: (ms) => (ms >= 60000 ? Promise.resolve() : new Promise((r) => setTimeout(r, 0))),
  });
  await s.tap();                       // a and b go into a share sheet that never settles
  await s.tap();                       // told: tap again to download
  await s.tap(new Set(['a']));         // a deck's Get all, for a only
  assert.ok(s.holds('b'), 'b is still held for its own share');
  assert.ok(!shared.slice(1).some((l) => l.includes('b')), 'b isn’t offered again');
});

test('2, 9, 11: what is said matches what happened', () => {
  assert.match(html, /function stopLanding\(b\) \{\s*clearTimeout\(b\.sayT\);/);
  assert.match(html, /function undoLanding\(b\) \{\s*if \(b\) clearTimeout\(b\.sayT\);/);
  assert.match(html, /const here = b\.pids\.filter\(\(k\) => files\.has\(k\)\)\.length;/, 'ready only when the bytes are here');
  assert.match(html, /if \(st\.done && here === n && !b\.saidReady\)/, 'a single photo too');
  assert.equal(a11y.say.left('Ada’s phone'), 'Ada’s phone left the heap.');
});

test('3: opening a deck from the keyboard moves focus into it', () => {
  assert.match(html, /function focusDeck\(\)/);
  assert.match(html, /openDeck\(el\._pids\); focusDeck\(\);/);
});

test('4, 6, 12: the layer and the list keep their buttons, and each opens what is there now', () => {
  assert.match(html, /const old = new Map\(\[\.\.\.\$\('decklayer'\)\.children\]\.map\(\(el\) => \[el\.dataset\.key, el\]\)\);/, 'kept by deck, so focus stays');
  assert.match(html, /item\._pids = d\.pids;/);
  assert.match(html, /const sig = rows\.map\(\(\[o, ps\]\) => `\$\{o\}:\$\{ps\.join\(','\)\}:\$\{sides\[o\] \|\| ''\}`\)\.join\('\|'\);/);
});

test('5: Esc and the shortcuts know about every dialog', () => {
  for (const k of ['kindbox', 'movebox', 'rejoinbox', 'warnbox', 'blockbox', 'lostbox', 'pairbox', 'hostbox', 'endbox', 'unsavedbox', 'askbox']) assert.match(html, new RegExp(`const OVERLAYS = \\[[^\\]]*'${k}'`), k);
  assert.match(html, /const ESC = \{ rejoinbox: 'rejoinkeep', blockbox: 'blockno', endbox: 'endno', movebox: 'moveno', hostbox: 'hostok', pairbox: 'pairclose' \};/);
});

test('7: a device that drops out for a moment isn’t said to have left', () => {
  assert.match(html, /setTimeout\(\(\) => \{ if \(!net\.peers\[k\]\) speak\(say\.left\(was\)\); \}, LEFT_AFTER\)/);
});

test('8: list rows stay buttons inside list items', () => {
  assert.match(html, /const item = document\.createElement\('div'\); item\.setAttribute\('role', 'listitem'\);\s*const b = Object\.assign\(document\.createElement\('button'\), \{ type: 'button' \}\);\s*b\.append\(Object\.assign\(document\.createElement\('b'\), \{ textContent: r\.title \}\)/);
});

test('10: a deck’s Get all leaves out a photo whose own share sheet is open', () => {
  assert.match(html, /const only = new Set\(actPrints\(\)\.map\(\(p\) => p\.pid\)\.filter\(\(k\) => !sharingOne\.has\(k\)\)\);/);
});

test('13: Esc puts a photo pulled out of a deck back on its deck', () => {
  assert.match(html, /const home = \{ anchor: p\.anchor, x: p\.x, y: p\.y \};/);
  assert.match(html, /startDrag\(\[p\], m\.clientX, m\.clientY, true, m\.pointerId, home\)/);
  assert.match(html, /if \(drag\.home\) Object\.assign\(p, drag\.home\);/);
});

test('14: arrow keys go to the photo that is really there, across moments', () => {
  const r = (x, y) => ({ left: x, top: y, right: x + 100, bottom: y + 100 });
  // moment 1: three photos in a row; moment 2 starts a new row lower down, with one photo
  const rects = [r(0, 0), r(110, 0), r(220, 0), r(0, 160)];
  assert.equal(a11y.nextByRect(rects, 2, 'ArrowDown'), 3, 'down from the third goes to the photo below, not past it');
  assert.equal(a11y.nextByRect(rects, 3, 'ArrowUp'), 0);
  assert.equal(a11y.nextByRect(rects, 0, 'ArrowRight'), 1);
  assert.equal(a11y.nextByRect(rects, 0, 'ArrowLeft'), 0, 'nothing that way: stays');
  assert.match(html, /nextByRect\(tiles\.map\(\(t\) => t\.getBoundingClientRect\(\)\), i, e\.key\)/);
});
