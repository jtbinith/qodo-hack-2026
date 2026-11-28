// Qodo's review of #164: the fixes for findings 1–7 (8, forged approvals, waits on the owner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSaveAll } from '../web/saveall.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const net = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');

test('1: a member who isn’t the host can still let their own other device in: they vouch, the host admits', () => {
  assert.match(html, /if \(net\.leader === id\) admitDevice\(d\.from\); else peers\.send\(net\.leader, \{ t: 'vouch', who: d\.from \}\);/);   // over the encrypted link since round 2
});

test('2: Undo after a move puts back the joins the move replaced', () => {
  assert.match(net, /lastMoves\.set\(j\.a, \{ j, before, after: JSON\.stringify\(s\.joins\) \}\)/);   // both screens since round 2
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
  assert.equal(s.saving(), false);
  s.tap();
  assert.equal(s.saving(), true);
  assert.match(html, /if \(left <= 0\) \{ if \(\(pickSave\.saving\(\) \|\| sharingOne\.size\) && left > -END_WAIT\) return; endNow\(\); \}/);
});

test('6: replacing a side ends every join on that side', () => {
  assert.match(html, /sides\[l\.side\] = \[\.\.\.\(sides\[l\.side\] \|\| \[\]\), l\.id\]/);
  assert.match(html, /for \(const k of r\.ks\) net\.unjoin\(k\);/);
});

test('7: the Picked panel lets go of its old thumbnails each time it redraws', () => {
  assert.match(html, /for \(const u of ppUrls\.splice\(0\)\) URL\.revokeObjectURL\(u\);/);
  assert.match(html, /ppUrls\.push\(u\)/);
});

// the second look at #164
test('round 2: a vouch comes over the encrypted link from a member, not as a room broadcast anyone could write', () => {
  assert.doesNotMatch(net, /event: 'vouch'/);
  assert.match(html, /peers\.send\(net\.leader, \{ t: 'vouch', who: d\.from \}\)/);
  assert.match(html, /if \(m\.t === 'vouch'\) \{ if \(net\.leader === id && inHeap\(from\) && typeof m\.who === 'string' && net\.peers\[m\.who\]\) admitDevice\(m\.who\); return; \}/);
});

test('round 2: Undo after a move restores both screens’ joins, and only if nothing has moved since', () => {
  assert.match(net, /const before = s\.joins\.filter\(\(x\) => \[x\.a, x\.b\]\.some\(\(k\) => k === j\.a \|\| k === j\.b\)\)/);
  assert.match(net, /after: JSON\.stringify\(s\.joins\)/);
  assert.match(net, /if \(JSON\.stringify\(s\.joins\) !== m\.after\) return;/);
});

// the third look at #164
test('round 3: Undo says Moved back only once the time keeper has done it', () => {
  assert.match(net, /announce\('unmoved', \{ a, ok, from: id \}\)/);
  assert.match(net, /ch\.on\('broadcast', \{ event: 'unmoved' \}/);
  assert.match(html, /if \(ev === 'unmoved' && d\.a === id\) toast\(d\.ok \? 'Moved back' : 'Couldn’t move back: the screens changed since'\);/);
  assert.doesNotMatch(html, /net\.unmove\(\); toast\('Moved back'\)/);
});
