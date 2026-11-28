// Edge cases (wireframes 2D.4, 2D.5, 2D.13): take back a photo sent to the wrong screen, photos come back
// from a screen that left, and a tab that is nearly full pauses and asks to save first
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as edges from '../web/edges.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

test('2D.4: the sender can stop a photo on its way to the wrong screen; the other screen is told', () => {
  assert.equal(edges.sendingLine('Ada’s phone'), 'Ada’s phone →');
  assert.equal(edges.tookBack('Bo', 1), 'Bo took a photo back');
  assert.equal(edges.tookBack('Bo', 3), 'Bo took 3 photos back');
  assert.match(html, /function takeBack\(s\)/);
  assert.match(html, /snackSay\(sendingLine\(deviceName\(to\)\), \(\) => takeBack\(s\), 15000, 'Stop'\)/);
  assert.match(html, /if \(m\.t === 'takeback'\)/);
  assert.match(html, /function snackSay\(text, undo = null, ms = 6000, label = 'Undo'\)/);
});

test('2D.5: my photos on a screen that left come back to mine', () => {
  const prints = new Map([['a', { pid: 'a', owner: 'me', anchor: 'gone' }], ['b', { pid: 'b', owner: 'x', anchor: 'gone' }], ['c', { pid: 'c', owner: 'me', anchor: 'me' }]]);
  assert.deepEqual(edges.comeBack(prints, 'gone', 'me'), ['a'], 'only mine, only from the screen that left');
  assert.match(html, /function bringBack\(k, was\)/);
  assert.match(html, /snackSay\(`\$\{was\} left`\)/);
});

test('2D.13: nearly full: new photos wait, with how many are here and how to make room', () => {
  const m = edges.memLine({ here: 12, waiting: 18, bytes: 1.1e9 });
  assert.deepEqual(m, { title: 'This tab is nearly full. Save the 12 you’ve got, then get the rest.', sub: 'Paused at 12 of 30 · 1.1 GB', note: 'Saving frees up room. The other 18 carry on after.' });
  assert.equal(edges.fits(900e6, 50e6, 1e9), true);
  assert.equal(edges.fits(990e6, 50e6, 1e9), false);
  assert.match(html, /<div id="membox" role="status" hidden>/);
  assert.match(html, /if \(!fid\.startsWith\('thumb:'\) && !fits\(heldBytes\(\), size, MEM_CAP\)\) \{ memWait\.add\(fid\); showMem\(\); return false; \}/);
  assert.match(html, /t: 'gone', pid/, 'a copy let go is said, so nobody asks this device for it');
});

test('2D.14 isn’t built: a web page can’t see how much space the phone has', () => {
  assert.doesNotMatch(html, /needs \d+ MB free/);
});
