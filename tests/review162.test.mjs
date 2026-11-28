// Qodo's review of #162: the fixes for findings 1, 3–14, 16, 18 and 19
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapTiles } from '../web/map.js';
import * as gate from '../web/gate.js';
import * as words from '../web/words.js';
import { createPeers } from '../web/peers.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const net = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');

test('1: the bar fills by pieces received out of pieces, not out of bytes', () => {
  assert.doesNotMatch(html, /coming\.got \/ coming\.size/);
  assert.match(html, /coming\.n \? coming\.got \/ coming\.n : 0/);
});

test('3: removed photos are remembered and told to screens that missed it', () => {
  assert.match(html, /const removed = new Map\(\);/, 'pid -> screens told');
  assert.match(html, /function tellRemoved\(/);
  assert.match(html, /const catchUp = \(\) => \{[\s\S]{0,400}tellRemoved\(\)/, 'catch-up says what is gone too');
  assert.match(html, /removed\.delete\(p\.pid\)/, 'Undo takes it off the list');
});

test('4, 6: a drop on the map sends like Send to: only what this device has, and ✓ once it arrived', () => {
  assert.match(html, /async function sendGives\(list, ps\)/);
  assert.match(html, /function giveTo\(ps, to\) \{[\s\S]{0,200}sendGives\(\[to\], ps\)/);
  assert.match(html, /\$\('sendlist'\)\.onclick = async[\s\S]{0,400}sendGives\(list, sending\)/);
  assert.doesNotMatch(html, /toast\(`Sent to \$\{nameOf\(to\)\} ✓`\)/);
});

test('5: a cancelled drag puts the drop map away', () => {
  assert.match(html, /addEventListener\('pointercancel', \(e\) => \{[\s\S]{0,120}showDropMap\(false\)/);
});

test('7: nothing is taken from a device that is not let in, and a waiting device sends nothing', () => {
  assert.match(html, /peers\.on\(\(from, m, bytes\) => \{\s*if \(from !== id && !inHeap\(from\)\) return;/);
  assert.match(html, /const others = \(\) => \(inHeap\(id\) \? Object\.keys/);
});

test('8, 14: Undo after Remove: the photo is only with its owner again, and a cut-short download asks again', () => {
  assert.match(html, /p\.holders = \[id\];/, 'old holders were told to let it go');
  assert.match(html, /const cutShort = new Set\(\);/);
  assert.match(html, /m\.t === 'unshare'[\s\S]{0,300}cutShort\.add\(p\.pid\)/);
  assert.match(html, /if \(cutShort\.delete\(m\.pid\)\) dropped\(prints\.get\(m\.pid\)\)/);
});

// 9: Stop tells the sender, and the sender stops between pieces
const channels = [];
class FakeChannel extends EventTarget { readyState = 'open'; bufferedAmount = 0; bufferedAmountLowThreshold = 0; sent = 0; send() { this.sent++; } }
class FakePC {
  connectionState = 'new'; signalingState = 'stable';
  createDataChannel() { const dc = new FakeChannel(); channels.push(dc); return dc; }
  async setLocalDescription() { this.localDescription = { type: 'offer', sdp: 'x', toJSON() { return this; } }; }
  async setRemoteDescription() {} async addIceCandidate() {}
}
globalThis.RTCPeerConnection = FakePC;
test('9: a send stops between pieces once the receiver says stop', async () => {
  const sent = [];
  const peers = createPeers({ myId: 'a', table: 'T', signal: (to, d) => sent.push([to, d]) });
  peers.connect('b'); const dc = channels.at(-1); dc.onopen();   // a direct link with room in its buffer
  let checks = 0;
  const r = await Promise.race([peers.sendFile('b', 'f1', new Blob([new Uint8Array(300)]), null, 100, () => checks++ >= 1), new Promise((ok) => setTimeout(() => ok('stuck'), 3000))]);
  assert.deepEqual(r, { sent: 1, of: 3, stopped: true });
  assert.equal(dc.sent, 1, 'one piece went, then it stopped');
  assert.match(html, /function stopLanding\([\s\S]{0,500}t: 'stop'/, 'Stop tells whoever is sending');
  assert.match(html, /m\.t === 'stop'/);
  assert.match(html, /stops\.has\(from \+ '\|' \+ m\.pid\)/);
});

test('10, 12: each drop keeps its own line; one that never comes is counted, so the line ends', () => {
  const has = new Set(['a1', 'a2', 'b1']), coming = new Set(['a3']);
  const batches = [{ pids: ['a1', 'a2', 'a3'] }, { pids: ['b1'] }];
  const s = words.landingState(batches, (p) => has.has(p), (p) => coming.has(p));
  assert.equal(s.b, batches[0], 'the one still arriving keeps Stop, though a later one has landed');
  assert.deepEqual([s.k, s.lost, s.done], [2, 0, false]);
  coming.delete('a3');   // gave up, or never asked (too many arriving)
  const t = words.landingState(batches, (p) => has.has(p), (p) => coming.has(p));
  assert.equal(t.b, batches[1]); assert.equal(t.done, true);
  const u = words.landingState([batches[0]], (p) => has.has(p), (p) => coming.has(p));
  assert.deepEqual([u.k, u.lost, u.done], [2, 1, true]);
  assert.equal(words.batchLine({ n: 3, k: 2, lost: 1, who: 'Ada', relay: false }), '3 photos from Ada · 1 didn’t come');
  assert.equal(words.batchLine({ n: 3, k: 3, who: 'Ada', relay: false }), '3 photos from Ada ✓');
  assert.match(html, /let landings = \[\];/);
});

test('11: a crowded heap still gets drop targets that fit', () => {
  const ids = ['me', ...Array.from({ length: 8 }, (_, i) => 'o' + i)];
  const sizes = Object.fromEntries(ids.map((k) => [k, { w: 390, h: 700 }]));
  const t = mapTiles(ids, { pos: { me: [0, 0] }, group: {} }, sizes, 'me', { w: 300, h: 104 });
  assert.equal(t.length, 9);
  for (const x of t) { assert.ok(x.w > 0 && x.h > 0, 'a real tile'); assert.ok(x.y + x.h <= 104 + 0.01, 'inside the map'); }
});

test('13: the line stays down while the drop map is up', () => {
  assert.match(html, /function updateLanding\(\) \{[\s\S]{0,80}if \(!\$\('dropmap'\)\.hidden\) return;/);
});

test('16: a new host keeps the list members already had, and asks again until it comes', () => {
  assert.match(net, /if \(s\.leader !== id && prev === id\) s\.admits = \{ open: false, ids: \[\], names: \[\], no: \[\] \};/, 'only a list I made alone is dropped');
  assert.match(net, /function askAdmits\(tries\)/);
  assert.match(net, /stopAskingAdmits\(\)/, 'stops once the list arrives');
});

test('18: only devices after the first 20 are told the heap is full', () => {
  const peers = Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['d' + String(i).padStart(2, '0'), { joinedAt: 1000 + i }]));
  assert.equal(gate.overLimit('d19', peers, 20), false, 'the 20th stays');
  assert.equal(gate.overLimit('d20', peers, 20), true, 'the 21st goes');
  peers.d20.joinedAt = 1019;   // same moment as the 20th: the smaller id is first
  assert.equal(gate.overLimit('d19', peers, 20), false);
  assert.equal(gate.overLimit('d20', peers, 20), true);
  assert.match(html, /overLimit\(id, net\.peers, LIMITS\.devices\)/);
});

test('19: the list keeps only who is here, without repeats, and stays under 200', () => {
  const peers = { a: {}, b: {} };
  const a = gate.trimAdmits({ open: false, ids: ['a', 'gone', 'a', 'b'], names: [...Array.from({ length: 250 }, (_, i) => 'n' + i), 'n1'], no: ['gone', 'b', 'b'] }, peers);
  assert.deepEqual(a.ids, ['a', 'b']);
  assert.deepEqual(a.no, ['b']);
  assert.equal(a.names.length, 200);
  assert.equal(new Set(a.names).size, 200);
  assert.ok(a.names.includes('n249') && a.names.includes('n1'), 'the latest are kept');
  assert.doesNotMatch(html, /net\.setAdmits\(\{/, 'every change goes through trimAdmits');
  assert.match(html, /const admit = \(a\) => net\.setAdmits\(trimAdmits\(a, net\.peers, id\)\);/);   // with the host kept (re-review)
});

// the re-review of #162
test('re-review 1: the host keeps its own place on the list even before the room lists it, so the list settles', () => {
  const a = gate.trimAdmits({ open: false, ids: ['me', 'gone'], names: [], no: [] }, {}, 'me');
  assert.deepEqual(a.ids, ['me']);
  assert.match(html, /const admit = \(a\) => net\.setAdmits\(trimAdmits\(a, net\.peers, id\)\);/);
  assert.match(html, /trimAdmits\(net\.admits, net\.peers, id\)\.ids\.length !== net\.admits\.ids\.length/);
});

test('re-review 2: Let everyone in is remembered for that heap only', () => {
  assert.equal(gate.openFor(gate.rememberOpen(null, 'AAAAA11111'), 'AAAAA11111'), true);
  assert.equal(gate.openFor(gate.rememberOpen(null, 'AAAAA11111'), 'BBBBB22222'), false, 'a later heap asks again');
  const two = gate.rememberOpen(gate.rememberOpen(null, 'AAAAA11111'), 'BBBBB22222');
  assert.equal(gate.openFor(two, 'AAAAA11111') && gate.openFor(two, 'BBBBB22222'), true);
  let many = null; for (let i = 0; i < 30; i++) many = gate.rememberOpen(many, 'C' + String(i).padStart(9, '0'));
  assert.equal(many.split(',').length, 20, 'the latest 20 heaps');
  assert.equal(gate.openFor('1', 'ANYCODE123'), true, 'the device check opens every heap it hosts');
  assert.match(html, /openFor\(localStorage\.getItem\(OPEN_KEY\), room\)/);
  assert.match(html, /localStorage\.setItem\(OPEN_KEY, rememberOpen\(localStorage\.getItem\(OPEN_KEY\), net\.room\.replace\(\/\^photo-\/, ''\)\)\)/);
});
