// Qodo's review of #164: the fixes for findings 1–7 (8, forged approvals, waits on the owner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSaveAll } from '../web/saveall.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const net = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');

test('1: a member who isn’t the host can still let their own other device in: they vouch, the host admits', () => {
  assert.match(net, /s\.vouch = \(who\) => send\('vouch', \{ from: id, who \}\);/);
  assert.match(net, /ch\.on\('broadcast', \{ event: 'vouch' \}/);
  assert.match(html, /if \(net\.leader === id\) admitDevice\(d\.from\); else net\.vouch\(d\.from\);/);
  assert.match(html, /ev === 'vouch' && net\.leader === id && inHeap\(d\.from\) && net\.peers\[d\.who\]/);
});

test('2: Undo after a move puts back the joins the move replaced', () => {
  assert.match(net, /lastMoves\.set\(j\.a, \{ j, before: s\.joins\.filter\(\(x\) => x\.a === j\.a \|\| x\.b === j\.a\) \}\)/);
  assert.match(net, /s\.unmove = \(\) =>/);
  assert.match(html, /net\.unmove\(\); toast\('Moved back'\)/);
});

test('3: nothing new goes on the table once the heap has ended', () => {
  assert.match(html, /if \(net\?\.admits\?\.ended\) \{ toast\('This heap has ended\. Nothing new can be added'\); break; \}/);
});

test('4: the other device keeps saying hello until it’s joined to the screen that showed the code', () => {
  assert.match(html, /net\.joins\.some\(\(j\) => \(j\.a === id && j\.b === pairing\.by\) \|\| \(j\.b === id && j\.a === pairing\.by\)\)/);
  assert.doesNotMatch(html, /inHeap\(id\) && net\.joins\.length\)\) return clearInterval\(hi\)/);
});

test('5: the heap waits for a save that is still going before it closes (at most 30 s)', async () => {
  const s = createSaveAll({ batch: () => ({ ready: [{ pid: 'a', file: {} }], arriving: 0 }), canShare: () => true, share: () => new Promise(() => {}), download: () => {}, toast: () => {}, wait: () => new Promise(() => {}) });
  assert.equal(s.busy(), false);
  s.tap();
  assert.equal(s.busy(), true);
  assert.match(html, /if \(left <= 0\) \{ if \(\(pickSave\.busy\(\) \|\| sharingOne\.size\) && left > -END_WAIT\) return; endNow\(\); \}/);
});

test('6: replacing a side ends every join on that side', () => {
  assert.match(html, /sides\[l\.side\] = \[\.\.\.\(sides\[l\.side\] \|\| \[\]\), l\.id\]/);
  assert.match(html, /for \(const k of r\.ks\) net\.unjoin\(k\);/);
});

test('7: the Picked panel lets go of its old thumbnails each time it redraws', () => {
  assert.match(html, /for \(const u of ppUrls\.splice\(0\)\) URL\.revokeObjectURL\(u\);/);
  assert.match(html, /ppUrls\.push\(u\)/);
});
