// Qodo's review of #161: the fixes for all 14 findings
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSaveAll } from '../web/saveall.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];

test('1, 11, 13: Sent ✓ only once it has arrived; only photos this device has go; a repeat send still lands', () => {
  assert.match(html, /function confirmSent\(/, 'waits for the receiver to say it has it');
  assert.match(html, /m\.t === 'have'[\s\S]{0,120}confirmSent\(from, m\.pid\)/);
  assert.doesNotMatch(html, /toast\(`Sent to \$\{to === '\*'/, 'no Sent ✓ straight after asking');
  assert.match(html, /const sendable = ps\.filter\(\(p\) => p\.owner === id \|\| files\.has\(p\.pid\)\)/);   // in sendGives since #162
  assert.match(html, /You don’t have \$\{/);
  assert.match(html, /Couldn’t send to \$\{/, 'a send that fails says so and can be tried again');
  assert.doesNotMatch(html, /if \(p && !files\.has\(p\.pid\) && \(p\.owner === from/, 'a give for a photo already here still lands');
});

test('2, 12: several photos can glide at once, and grabbing one takes it over', () => {
  assert.match(html, /let drag = null, flies = \[\];/);
  assert.match(html, /flies = flies\.filter\(\(f\) => !f\.ps\.some\(\(q\) => d\.pids\.includes\(q\.pid\)\)\)/, 'a grab stops that glide');
});

test('3: the deck sheet scrolls on touch; only a sideways drag pulls a photo out', () => {
  assert.match(css, /#decktiles button \{[^}]*touch-action: pan-y/);
  assert.match(html, /if \(Math\.abs\(m\.clientY - sy\) > Math\.abs\(m\.clientX - sx\)\) return letGo\(\);/);
  assert.match(html, /b\.onpointercancel = /);
});

test('4, 14: join timings are named, and a typed code waits longer before saying no heap', () => {
  assert.match(html, /const NOT_FOUND_AFTER = 4000, NOT_FOUND_TRIES = 2, JOIN_WINDOW_S = 2;/);
  assert.match(html, /let left = JOIN_WINDOW_S;/);
  assert.doesNotMatch(html, /\}, 4000\);/);
});

test('5: a failed share names the button there is (Get)', async () => {
  const said = [];
  const s = createSaveAll({ batch: () => ({ ready: [{ pid: 'a', file: {} }], arriving: 0 }), canShare: () => true, share: () => Promise.reject(new Error('x')), download: () => {}, toast: (m) => said.push(m), label: 'Get', wait: () => Promise.resolve() });
  await s.tap();
  assert.ok(said.some((m) => /Tap Get again/.test(m)), said.join(' | '));
});

test('6, 7: a drag belongs to the finger that started it, and an interrupted one is finished', () => {
  assert.match(html, /drag = \{ ps, p, pointer,/);
  assert.match(html, /if \(!drag \|\| e\.pointerId !== drag\.pointer\) return;/);
  assert.match(html, /addEventListener\('pointercancel', /);
});

test('8, 10: a photo already here still says who it came from; each drop has its own Undo', () => {
  assert.match(html, /if \(onMyScreen\(p\) && from !== id\) noteLanding\(from, p, m\.drop\)/);
  assert.match(html, /t: 'dropcheck', pid: q\.pid, drop/);
  assert.match(html, /b\.drop !== drop/);   // per drop since #162
});

test('9 and its re-review: a tap waits only for photos Get is handing over, and says how to recover a stuck share', () => {
  assert.match(html, /if \(pickSave\.holds\(p\.pid\) \|\| sharingOne\.has\(p\.pid\)\) return toast\('Still saving this one\. If the share sheet is stuck, tap Get again'\);/);   // and its own share sheet since #163
  assert.doesNotMatch(html, /pickSave\.busy\(\)/, 'other photos aren’t blocked');
});

test('re-review of #161: a share that never settles holds only its own photos', async () => {
  const s = createSaveAll({ batch: (handed) => ({ ready: [{ pid: 'a', file: {} }].filter((r) => !handed.has(r.pid)), arriving: 0 }), canShare: () => true,
    share: () => new Promise(() => {}), download: () => {}, toast: () => {}, label: 'Get', wait: () => Promise.resolve() });
  await s.tap();   // the sheet never settles; the timeout frees Get
  assert.equal(s.holds('a'), true, 'the photo in the hung share is held');
  assert.equal(s.holds('b'), false, 'another photo isn’t');
});
