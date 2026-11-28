// Qodo's review of #163, and the reload that CI caught: the fixes for all 17 findings
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as gate from '../web/gate.js';
import { moments, momentLabel } from '../web/moments.js';
import { refused, validSignal } from '../web/check.js';
import { checkWords, makeKeyPair } from '../web/seal.js';
import { createPeers } from '../web/peers.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

test('reload (CI): this tab’s own earlier copy in the room doesn’t take its name', () => {
  const peers = { old: { name: 'Ada', joinedAt: 1 }, me: { name: 'Ada', joinedAt: 5 } };
  assert.equal(gate.nameTaken('me', peers), 'Ada', 'someone else called Ada still counts');
  assert.equal(gate.nameTaken('me', peers, ['old']), null, 'my tab before the reload doesn’t');
  assert.match(html, /const PREV_KEY = 'heap-me-before'/);
  assert.match(html, /nameTaken\(id, net\.peers, before\)/);
});

test('1: someone the host removed stays out, even when everyone is let in without asking', () => {
  const ctx = { leader: 'h', admits: { open: true, ids: [], names: [], no: ['x'] }, peers: { h: {}, x: { name: 'X' }, y: { name: 'Y' } } };
  assert.equal(gate.isIn('x', ctx), false);
  assert.equal(gate.isIn('y', ctx), true);
  assert.equal(gate.isIn('h', ctx), true, 'the host is always in');
});

test('2: a sender leaving stops only what was coming from them', () => {
  assert.match(html, /if \(!files\.has\(pid\) && incoming\.get\(pid\)\?\.from === x\.from\) incoming\.delete\(pid\)/);
});

test('3: Save before leaving opens the share sheet inside the tap', () => {
  assert.match(html, /\$\('leavesave'\)\.onclick = \(\) => \{[^\n]*getPicked\(\); closeSheet\('leavebox'\); \};/);
  assert.doesNotMatch(html, /closeSheet\('leavebox', \(\) => getPicked\(\)\)/);
});

test('4: Try again reconnects without reloading, so photos already here stay', () => {
  assert.doesNotMatch(html, /\$\('losttry'\)\.onclick = \(\) => location\.reload\(\)/);
  assert.match(html, /\$\('losttry'\)\.onclick = \(\) => \{[\s\S]{0,300}start\(room(, true)?\)/);
});

test('5: All photos counts what this screen shows, and hides when nothing shows', () => {
  assert.match(html, /const shown = visiblePrints\(\)\.size;\s*\$\('allphotos'\)\.hidden = !shown; \$\('allphotos'\)\.textContent = `All photos · \$\{shown\}`;/);
});

test('6: photos without a time go in their own Earlier moment, after the timed ones', () => {
  const list = [{ pid: 'u' }, { pid: 'a', at: 1_000_000_000 }, { pid: 'b', at: 1_000_000_000 + 60000 }, { pid: 'c', at: 1_000_000_000 + 3 * 3600000 }];
  const m = moments(list);
  assert.deepEqual(m.map((x) => x.items.map((p) => p.pid)), [['c'], ['b', 'a'], ['u']]);
  assert.equal(m[1].from, 1_000_000_000); assert.equal(m[1].to, 1_000_000_000 + 60000);
  assert.equal(momentLabel(m[2], 'en-GB', 'UTC'), 'Earlier');
});

test('7, 15: a photo is asked for only from a device that is here and let in', () => {
  assert.match(html, /function sourceOf\(p\)/);
  assert.match(html, /\(p\.holders \|\| \[\]\)\.find\(\(k\) => k !== id && net\.peers\[k\] && inHeap\(k\)\)/);
  assert.doesNotMatch(html, /\|\| p\.owner;\n/, 'never the owner just because nobody else is listed');
  assert.match(html, /Nobody here has \$\{p\.name\} now/);
});

test('8: programs are refused when they arrive too, and more kinds of them', () => {
  for (const n of ['a.command', 'a.url', 'a.desktop', 'a.iso', 'a.chm', 'a.msix', 'a.appimage', 'a.shtml', 'a.mht', 'a.svgz', 'a.docm', 'a.xlsm', 'a.pptm']) assert.ok(refused(n, ''), n);
  for (const n of ['photo.jpg', 'clip.mp4', 'notes.txt', 'report.pdf', 'sheet.xlsx']) assert.ok(!refused(n, ''), n);
  assert.match(html, /m\.t === 'print'\) \{\s*if \(prints\.has\(m\.pid\) \|\| prints\.size >= LIMITS\.prints \|\| !validPrint\(m\) \|\| refused\(m\.name, m\.type\)\) return;/);
});

test('9: hiding someone unpicks their photos', () => {
  assert.match(html, /\$\('phide'\)\.onclick = \(\) => \{[\s\S]{0,300}for \(const k of \[\.\.\.picked\]\) if \(prints\.get\(k\)\?\.owner === personK\) picked\.delete\(k\)/);
});

test('10: a big file waiting for a tap counts as here for the line, not as didn’t come', () => {
  assert.match(html, /const waitsForTap = \(pid\) => \{ const p = prints\.get\(pid\); return !!p && p\.size > BIG_FILE && !files\.has\(pid\) && !incoming\.has\(pid\); \};/);
  assert.match(html, /const hasFile = \(pid\) => files\.has\(pid\) \|\| waitsForTap\(pid\)/);
});

test('11: a second tap on Share doesn’t share the note twice', () => {
  assert.match(html, /let textSending = false;/);
  assert.match(html, /\$\('textshare'\)\.onclick = \(\) => \{\s*if \(textSending\) return;/);
});

test('12: one photo’s share sheet at a time', () => {
  assert.match(html, /const sharingOne = new Set\(\);/);
  assert.match(html, /if \(pickSave\.holds\(p\.pid\) \|\| sharingOne\.has\(p\.pid\)\) return toast/);
  assert.match(html, /sharingOne\.add\(p\.pid\)/);
});

test('13: Get on one photo gets just that one', () => {
  assert.match(html, /\$\('previewget'\)\.onclick = \(\) => \{[^\n]*getOne\(p\)/);
  assert.doesNotMatch(html, /picked\.add\(p\.pid\); getPicked\(\)/);
  assert.doesNotMatch(html, /picked\.add\(p\.pid\); showPicks\(\); getPicked\(\)/);
});

test('14: the check shows only that person’s words, and Yes waits for them', () => {
  assert.match(html, /\$\('checkyes'\)\.disabled = true;/);
  assert.match(html, /if \(personK !== k \|\| \$\('checkbox'\)\.hidden\) return;/);
  assert.match(html, /\$\('checkyes'\)\.dataset\.for = k; \$\('checkyes'\)\.disabled = false;/);
  assert.match(html, /\$\('checkyes'\)\.onclick = \(\) => \{\s*const k = \$\('checkyes'\)\.dataset\.for; if \(!k \|\| \$\('checkyes'\)\.disabled\) return;/);
});

test('16: Leave and clear forgets the heap’s code', () => {
  assert.equal(gate.forgetOpen('AAAAA11111,BBBBB22222', 'AAAAA11111'), 'BBBBB22222');
  assert.equal(gate.forgetOpen('1', 'AAAAA11111'), '1', 'the device check’s setting stays');
  assert.match(html, /function leaveAndClear\(\) \{[\s\S]{0,400}forgetOpen\(/);
});

// 17: each device commits to a secret before it sees the other's, so nobody in the middle can try
// keys until the four words match: it gets one guess
const fakes = [];
class FakeChannel extends EventTarget { readyState = 'connecting'; bufferedAmount = 0; bufferedAmountLowThreshold = 0; send() {} }
class FakePC {
  connectionState = 'new'; signalingState = 'stable';
  constructor() { fakes.push(this); }
  createDataChannel() { return new FakeChannel(); }
  async setLocalDescription() { this.localDescription = { type: 'offer', sdp: 'x', toJSON() { return { type: 'offer', sdp: 'x' }; } }; }
  async setRemoteDescription() {} async addIceCandidate() {}
}
globalThis.RTCPeerConnection = FakePC;
const settle = async (n = 200) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
// two devices whose key signals reach each other (offers and candidates aren't needed here)
function pair(tamper = (from, d) => d) {
  const dev = {};
  const mk = (me, other) => createPeers({ myId: me, table: 'photo-T', signal: (to, d) => { const x = tamper(me, d); if (x && !('desc' in x) && !('cand' in x)) setImmediate(() => dev[other].onSignal(me, x)); } });
  dev.a = mk('a', 'b'); dev.b = mk('b', 'a');
  return dev;
}

test('17: both devices show the same four words once each has seen the other’s commitment', async () => {
  const dev = pair();
  dev.a.connect('b');
  let wa = null, wb = null;   // real crypto can take a moment on a busy machine: wait for both, up to 5 s
  for (const t0 = Date.now(); (!wa || !wb) && Date.now() - t0 < 5000;) { await settle(20); wa = await dev.a.words('b'); wb = await dev.b.words('a'); }
  assert.ok(wa && wa.length === 4, 'four words');
  assert.deepEqual(wa, wb);
});

test('17: a key without a commitment gets no reveal, and no words', async () => {
  const sent = [];
  const b = createPeers({ myId: 'b', table: 'photo-T', signal: (to, d) => sent.push(d) });
  const { pub } = await makeKeyPair();
  await b.onSignal('a', { pub: Buffer.from(pub).toString('base64') });
  await settle();
  assert.equal(sent.filter((d) => 'reveal' in d).length, 0, 'nothing revealed before their commitment');
  assert.equal(await b.words('a'), null);
});

test('17: a secret that doesn’t match its commitment gives no words', async () => {
  const dev = pair((from, d) => (from === 'a' && 'reveal' in d ? { ...d, reveal: Buffer.alloc(16, 7).toString('base64') } : d));
  dev.a.connect('b');
  await settle();
  assert.equal(await dev.b.words('a'), null, 'B can’t check: A’s secret was swapped');
});

test('17: the words depend on both secrets, and the signals are checked', async () => {
  const { pub: x } = await makeKeyPair(), { pub: y } = await makeKeyPair();
  const n1 = new Uint8Array(16).fill(1), n2 = new Uint8Array(16).fill(2), n3 = new Uint8Array(16).fill(3);
  assert.deepEqual(await checkWords(x, y, 'T', n1, n2), await checkWords(y, x, 'T', n2, n1), 'same on both sides');
  assert.notDeepEqual(await checkWords(x, y, 'T', n1, n2), await checkWords(x, y, 'T', n1, n3), 'another secret, other words');
  const env = (data) => ({ from: 'aaaaaaaa', to: 'bbbbbbbb', data });
  assert.ok(validSignal(env({ pub: 'AAAA', commit: 'A'.repeat(44) })));
  assert.ok(validSignal(env({ reveal: 'A'.repeat(24) })));
  assert.ok(validSignal(env({ reveal: 'A'.repeat(24), again: true })));
  assert.ok(!validSignal(env({ reveal: 'A'.repeat(400) })), 'a secret is small');
  assert.ok(!validSignal(env({ pub: 'AAAA', commit: 'A'.repeat(400) })));
});

// the re-review of #163
test('re-review: Try again rejoins with the same keys, so the other devices still understand it', () => {
  assert.match(html, /function start\(room, again = false\)/);
  assert.match(html, /if \(!again\) \{\s*peers = createPeers\(/, 'the same keys and links: the others keep the key they have for this device');
  assert.match(html, /if \(!again\) peers\.onReady\(catchUp\);/);
  assert.match(html, /\$\('losttry'\)\.onclick = \(\) => \{[\s\S]{0,300}start\(room, true\)/);
});

test('re-review: a share sheet that never settles frees that photo after SHARE_TIMEOUT', () => {
  assert.match(html, /setTimeout\(\(\) => \{ if \(sharingOne\.delete\(p\.pid\)\) stuckShare\.add\(p\.pid\); \}, SHARE_TIMEOUT\)/);   // and the next tap downloads (round 3)
  assert.match(html, /import \{[^}]*SHARE_TIMEOUT[^}]*\} from '\.\/saveall\.js';/);
});

// the third look at #163
const netSrc = readFileSync(new URL('../web/net.js', import.meta.url), 'utf8');
test('round 3: Try again keeps this device’s place in the queue, so nobody who came later becomes the host', () => {
  assert.match(netSrc, /export function joinRoom\(\{ room, id, name, size, onSignal, onReturn = \(\) => \{\}, linked = \(\) => false, since = null \}\)/);
  assert.match(netSrc, /const joinedAt = since \?\? wall\(\);/);
  assert.match(netSrc, /joinedAt,\s*\/\/ when this device joined/);
  assert.match(html, /since: again \? net\?\.joinedAt : null/);
});

test('round 3: after a share sheet that never settled, the next tap downloads instead', () => {
  assert.match(html, /const stuckShare = new Set\(\);/);
  assert.match(html, /setTimeout\(\(\) => \{ if \(sharingOne\.delete\(p\.pid\)\) stuckShare\.add\(p\.pid\); \}, SHARE_TIMEOUT\)/);
  assert.match(html, /if \(stuckShare\.delete\(p\.pid\)\) \{ downloadFile\(file\); pickSave\.handed\.add\(p\.pid\); return; \}/);
});

// the fourth look at #163
test('round 4: Try again keeps who was let in, so guests aren’t sent back to waiting', () => {
  assert.match(netSrc, /linked = \(\) => false, since = null, admitted = null \}\)/);
  assert.match(netSrc, /admits: admitted \|\| \{ open: false, ids: \[\], names: \[\], no: \[\] \},/);
  assert.match(html, /admitted: again \? net\?\.admits : null/);
});
