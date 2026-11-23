// Unit tests for web/peers.js: no send waits forever on another device (S1.3, threat T-D4).
// WebRTC is replaced with a fake so a test can hold a device's buffer full or keep its key
// back, and the clock is mocked so 10 seconds pass instantly.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as peersMod from '../web/peers.js';
const { createPeers } = peersMod, OFFER_RESEND = peersMod.OFFER_RESEND ?? 3000;
import { makeKeyPair, b64 } from '../web/seal.js';

const TIMEOUT = 10_000;              // the ticket: a send gives up after 10 s with no progress
const FULL = 2 << 20;                // more than the direct link's high-water mark
const PIECE = 64 * 1024;             // one piece on a direct link

const channels = [];
class FakeChannel extends EventTarget {
  readyState = 'open'; bufferedAmount = 0; bufferedAmountLowThreshold = 0; sent = 0;
  send() { this.sent++; }
  drainTo(n) { this.bufferedAmount = n; if (n <= this.bufferedAmountLowThreshold) this.dispatchEvent(new Event('bufferedamountlow')); }
}
// Signalling is modelled only as far as an offer and its answer: like a browser, an answer is
// refused unless an offer of ours is waiting for one
const pcs = [];
class FakePC {
  connectionState = 'new'; signalingState = 'stable'; localDescription = null; remoteDescription = null;
  constructor() { pcs.push(this); }
  createDataChannel() { const dc = new FakeChannel(); channels.push(dc); return dc; }
  async setLocalDescription() {
    const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
    this.localDescription = { type, sdp: type + ' sdp', toJSON() { return { type: this.type, sdp: this.sdp }; } };
    this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d) {
    if (d.type === 'answer' && this.signalingState !== 'have-local-offer') throw new Error('InvalidStateError: no offer waiting for an answer');
    this.remoteDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  async addIceCandidate() {}
}
globalThis.RTCPeerConnection = FakePC;

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }));
afterEach(() => mock.timers.reset());

// Let real async work (file reads, crypto) finish. setImmediate isn't mocked.
const settle = async (n = 50) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const tick = async (ms) => { mock.timers.tick(ms); await settle(); };
// Real time, not loop turns: WebCrypto runs outside the mocked clock and can be slow on a busy machine.
async function waitFor(cond, msg = 'condition never met', ms = 2000) { const start = Date.now(); while (!cond() && Date.now() - start < ms) await new Promise((r) => setImmediate(r)); assert.ok(cond(), msg); }
function watch(p) {
  const s = { state: 'pending' };
  p.then(() => { s.state = 'fulfilled'; }, (e) => { s.state = 'rejected'; s.error = e; });
  return s;
}
function room() {
  const sent = [];
  const peers = createPeers({ myId: 'a', table: 'T', signal: (to, d) => sent.push([to, d]) });
  return { peers, frames: (to) => sent.filter(([t, d]) => t === to && d.r).length };
}
async function giveKey(peers, from) { const { pub } = await makeKeyPair(); await peers.onSignal(from, { pub: b64(pub), reply: true }); }
function direct(peers, peer) { peers.connect(peer); const dc = channels.at(-1); dc.onopen(); return dc; }
const file = (bytes) => new Blob([new Uint8Array(bytes)]);

test('a send to a device that never sends its key gives up after 10 s', async () => {
  const { peers } = room();
  const s = watch(peers.sendFile('c', 'f1', file(100)));
  await settle();
  await tick(TIMEOUT - 1);
  assert.equal(s.state, 'pending', 'gave up too early');
  await tick(1);
  assert.equal(s.state, 'rejected', 'still waiting after 10 s');
});

test('the cancelled send is not delivered late, and the receiver can ask again', async () => {
  const { peers, frames } = room();
  const s = watch(peers.sendFile('c', 'f1', file(100)));
  await settle(); await tick(TIMEOUT);
  assert.equal(s.state, 'rejected');
  await giveKey(peers, 'c');
  await settle();
  assert.equal(frames('c'), 0, 'a cancelled piece was sent once the key arrived');
  const again = watch(peers.sendFile('c', 'f1', file(100)));   // the receiver asks again
  await waitFor(() => frames('c') === 1);
  await tick(100);
  assert.equal(again.state, 'fulfilled');
});

test('a key that arrives before 10 s lets the send finish', async () => {
  const { peers, frames } = room();
  const s = watch(peers.sendFile('b', 'f1', file(100)));
  await settle(); await tick(TIMEOUT - 1000);
  await giveKey(peers, 'b');
  await waitFor(() => frames('b') === 1);
  await tick(2000);
  assert.equal(s.state, 'fulfilled');
});

test('a direct link whose buffer never drains gives up after 10 s', async () => {
  const { peers } = room();
  const dc = direct(peers, 'b');
  dc.bufferedAmount = FULL;
  const s = watch(peers.sendFile('b', 'f1', file(100)));
  await settle();
  await tick(TIMEOUT - 1);
  assert.equal(s.state, 'pending', 'gave up too early');
  await tick(1);
  assert.equal(s.state, 'rejected', 'still waiting after 10 s');
  assert.equal(dc.sent, 0);
});

test('the timer restarts whenever the buffer drains', async () => {
  const { peers } = room();
  const dc = direct(peers, 'b');
  dc.bufferedAmount = FULL;
  const s = watch(peers.sendFile('b', 'f1', file(2 * PIECE)));   // two pieces, each waits 9 s
  await settle();
  await tick(TIMEOUT - 1000);
  dc.drainTo(0); dc.bufferedAmount = FULL;                        // first piece goes, buffer full again
  await settle();
  await tick(TIMEOUT - 1000);
  assert.equal(s.state, 'pending', 'gave up though the buffer drained 9 s ago');
  dc.drainTo(0);
  await settle();
  assert.equal(s.state, 'fulfilled');
  assert.equal(dc.sent, 2);
});

test('a throttled but working link finishes', async () => {
  const { peers } = room();
  const dc = direct(peers, 'b');
  dc.bufferedAmount = FULL;
  const s = watch(peers.sendFile('b', 'f1', file(100)));
  await settle();
  for (let t = 0; t < 25; t++) {                                  // 25 s of slow draining, never below the low mark
    dc.bufferedAmount -= 50 * 1024;
    await tick(1000);
    assert.equal(s.state, 'pending', `gave up after ${t + 1} s though the buffer was draining`);
  }
  dc.drainTo(0);
  await settle();
  assert.equal(s.state, 'fulfilled');
});

test('a silent device times out while two others keep transferring', async () => {
  const { peers, frames } = room();
  await giveKey(peers, 'b');
  const silent = watch(peers.sendFile('c', 'f1', file(100)));
  await settle();
  const live = watch(peers.sendFile('b', 'f2', file(100)));
  await waitFor(() => frames('b') === 1, 'a later frame to another device never went out');
  await tick(100);
  assert.equal(live.state, 'fulfilled', 'the silent device held up the other transfer');
  assert.equal(silent.state, 'pending');
  await tick(TIMEOUT);
  assert.equal(silent.state, 'rejected');
  const later = watch(peers.sendFile('b', 'f3', file(100)));
  await waitFor(() => frames('b') === 2);
  await tick(100);
  assert.equal(later.state, 'fulfilled');
});

test('a short message to a silent device is dropped after 10 s without an error', async () => {
  const { peers } = room();
  const s = watch(peers.send('c', { t: 'have', pid: '0123456789abcdef' }));
  await settle(); await tick(TIMEOUT);
  assert.equal(s.state, 'fulfilled');
});

// Qodo on #44: a print dropped after 10 s was still counted as announced, so a device whose
// key came late never saw the photo. The caller must learn the message was dropped, and when
// the key arrives, so it can announce again.
test('a short message says whether it was sent or dropped', async () => {
  const { peers, frames } = room();
  const lost = peers.send('c', { t: 'print', pid: '0123456789abcdef' });
  await settle(); await tick(TIMEOUT);
  assert.equal(await lost, false, 'a dropped message was reported as sent');
  await giveKey(peers, 'b');
  const sent = peers.send('b', { t: 'print', pid: '0123456789abcdef' });
  // the relay seals with real WebCrypto before it sets its (mocked) gap timer: wait for the frame in
  // real time, or the tick can run before that timer exists and the send never resolves (#105)
  await waitFor(() => frames('b') === 1, 'the sent message never went out'); await tick(100);
  assert.equal(await sent, true, 'a sent message was reported as dropped');
  const late = peers.send('d', { t: 'print', pid: '0123456789abcdef' });
  await settle(); await tick(TIMEOUT - 1000);
  await giveKey(peers, 'd');
  await waitFor(() => frames('d') === 1, 'the held message never went out once the key came'); await tick(100);
  assert.equal(await late, true, 'a message held until the key came was reported as dropped');
});

test('the caller hears when a device\'s key arrives, but not a bad one', async () => {
  const { peers } = room();
  const ready = [];
  peers.onReady((peer) => ready.push(peer));
  peers.send('c', { t: 'print', pid: '0123456789abcdef' });
  await settle(); await tick(TIMEOUT);
  await giveKey(peers, 'c');                                       // the key comes after the print was dropped
  await settle();
  assert.deepEqual(ready, ['c']);
  await peers.onSignal('e', { pub: 'not a key', reply: true });
  await settle();
  assert.deepEqual(ready, ['c'], 'a bad key was reported as ready');
});

// The relay queue is shared by every device. One frame that fails to go out (seal() or
// signal() throws) must fail only its own send, not every later relay send to everyone.
test('one relay frame that fails to send doesn\'t block later frames', async () => {
  const sent = [];
  const peers = createPeers({ myId: 'a', table: 'T', signal: (to, d) => {
    if (d.r && to === 'x') throw new Error('room server refused the frame');
    sent.push([to, d]);
  } });
  const frames = (to) => sent.filter(([t, d]) => t === to && d.r).length;
  await giveKey(peers, 'x'); await giveKey(peers, 'b');
  const bad = peers.send('x', { t: 'print', pid: '0123456789abcdef' });
  await settle(); await tick(100);
  assert.equal(await bad, false, 'the failed frame was reported as sent');
  const good = peers.send('b', { t: 'print', pid: '0123456789abcdef' });
  // sealing uses real WebCrypto, outside the mocked clock: wait for the frame before moving the clock
  await waitFor(() => frames('b') === 1, 'a later frame to another device never went out');
  await tick(100);
  assert.equal(await good, true, 'a later frame to another device was reported as dropped');
});

// Qodo on #87 (cbfbb88c): the caller can tell a send that moved nothing from one that stalled
// halfway, so it gives back only the first.
test('a send that gives up before any piece left says it sent 0 pieces (Qodo on #87)', async () => {
  const { peers } = room();
  const s = watch(peers.sendFile('c', 'f1', file(100)));
  await settle(); await tick(TIMEOUT);
  assert.equal(s.state, 'rejected');
  assert.deepEqual(s.error.sent, { sent: 0, of: 1 });
});
test('a send that stalls after some pieces says how many it sent (Qodo on #87)', async () => {
  const { peers } = room();
  const dc = direct(peers, 'c');
  dc.send = function () { this.sent++; this.bufferedAmount = FULL; };   // the buffer fills after the first piece
  const s = watch(peers.sendFile('c', 'f1', file(3 * PIECE)));
  await settle(); await tick(TIMEOUT); await settle();
  assert.equal(s.state, 'rejected');
  assert.deepEqual(s.error.sent, { sent: 1, of: 3 });
});
test('a send says how many of its pieces left when it finishes (Qodo on #87)', async () => {
  const { peers } = room();
  direct(peers, 'c');
  const s = watch(peers.sendFile('c', 'f1', file(3 * PIECE)));
  await settle();
  assert.equal(s.state, 'fulfilled');
  assert.deepEqual(await peers.sendFile('c', 'f1', file(3 * PIECE), [0, 2]), { sent: 2, of: 2 });
});
// blind review 7: relay frames that are dropped (a bad key, a full outbox) resolve false without
// throwing. The send finishes, but says none of its pieces left, so the caller gives it back
test('a relay send whose frames are all dropped finishes saying it sent 0 pieces (blind review 7)', async () => {
  const { peers, frames } = room();
  await peers.onSignal('c', { pub: 'bm90IGEga2V5', reply: true });   // a malformed key: every frame is dropped
  const r = await peers.sendFile('c', 'f1', file(3 * 24576));
  assert.deepEqual(r, { sent: 0, of: 3 });
  assert.equal(frames('c'), 0);
});
test('an error another send already marked gives unknown counts, so nothing is given back (blind review 7)', async () => {
  const { peers } = room();
  const dc = direct(peers, 'c'), shared = new Error('shared');
  Object.defineProperty(shared, 'sent', { value: { sent: 0, of: 1 }, configurable: true });
  dc.send = () => { throw shared; };
  const s = watch(peers.sendFile('c', 'f1', file(PIECE)));
  await settle();
  assert.equal(s.state, 'rejected');
  assert.equal(s.error.sent, null);
});


// Qodo's local review of c65f992: net.js may drop setup that arrives before its sender's presence
// (S1.6). If the offer was dropped, the device that made it hears the other device's first key
// once that device sees it in the room, but no answer. It sends the offer again after
// OFFER_RESEND, so the pair still gets a direct link instead of staying on the relay.
async function offering() {
  const sent = [];
  const peers = createPeers({ myId: 'a', table: 'T', signal: (to, d) => sent.push([to, d]) });
  peers.connect('b');                                  // a < b: a makes the offer
  const pc = pcs.at(-1);
  await pc.onnegotiationneeded(); await settle();
  const offers = () => sent.filter(([to, d]) => to === 'b' && d.desc?.type === 'offer').length;
  assert.equal(offers(), 1);
  return { peers, pc, offers };
}
const firstKey = async () => { const { pub } = await makeKeyPair(); return { pub: b64(pub) }; };

test('an offer the other device never answered is sent again once its first key arrives', async () => {
  assert.equal(typeof peersMod.OFFER_RESEND, 'number', 'OFFER_RESEND is a named constant');
  const { peers, offers } = await offering();
  await peers.onSignal('b', await firstKey());        // b now sees a in the room, but lost the offer
  await settle();
  await tick(OFFER_RESEND - 1);
  assert.equal(offers(), 1, 'sent again too early');
  await tick(1);
  assert.equal(offers(), 2, 'the offer was never sent again');
  await tick(10 * OFFER_RESEND);
  assert.equal(offers(), 2, 'sent again more than once for one key');
});

test('an offer that is answered in time is not sent again', async () => {
  const { peers, pc, offers } = await offering();
  await peers.onSignal('b', await firstKey());
  await peers.onSignal('b', { desc: { type: 'answer', sdp: 'answer sdp' } });
  assert.equal(pc.signalingState, 'stable');
  await tick(10 * OFFER_RESEND);
  assert.equal(offers(), 1);
});

// Qodo's review of d264fe6 on #116: the resend was set up only by a first-time key that came
// after the offer. A key that came before the offer, or only as a reply, set up nothing, so a
// dropped offer was never sent again.
test('an offer made after the other device\'s key arrived is sent again if it isn\'t answered', async () => {
  const sent = [];
  const peers = createPeers({ myId: 'a', table: 'T', signal: (to, d) => sent.push([to, d]) });
  peers.connect('b');
  const pc = pcs.at(-1);
  await peers.onSignal('b', await firstKey());        // b's key comes first, while a is still stable
  await settle();
  await pc.onnegotiationneeded(); await settle();
  const offers = () => sent.filter(([to, d]) => to === 'b' && d.desc?.type === 'offer').length;
  assert.equal(offers(), 1);
  await tick(OFFER_RESEND);
  assert.equal(offers(), 2, 'the offer was never sent again');
  await tick(10 * OFFER_RESEND);
  assert.equal(offers(), 2, 'sent again more than once');
});

test('an unanswered offer is sent again when the only key that arrives is a reply', async () => {
  const { peers, offers } = await offering();
  await peers.onSignal('b', { ...(await firstKey()), reply: true });
  await settle();
  await tick(OFFER_RESEND);
  assert.equal(offers(), 2, 'a reply key set up no resend');
  await tick(10 * OFFER_RESEND);
  assert.equal(offers(), 2, 'sent again more than once');
});

// Qodo's review of cc2cc80 on #116: the resend was once per link, so after the first offer was
// answered, a later offer (a new negotiation) that was dropped was never sent again. Each offer
// now gets its own resend, and a timer still sends only the offer it was set for.
test('a later unanswered offer gets its own resend, and the first offer\'s timer doesn\'t send it', async () => {
  const { peers, pc, offers } = await offering();
  await peers.onSignal('b', await firstKey());        // first offer's timer starts now
  await peers.onSignal('b', { desc: { type: 'answer', sdp: 'answer sdp' } });
  await tick(OFFER_RESEND / 2);
  await pc.onnegotiationneeded(); await settle();     // a new offer before the first timer fires
  assert.equal(offers(), 2);
  await tick(OFFER_RESEND / 2);                       // the first offer's timer fires
  assert.equal(offers(), 2, 'a different offer was sent again by the first one\'s timer');
  await tick(OFFER_RESEND / 2);                       // the later offer's own timer fires
  assert.equal(offers(), 3, 'the later offer was never sent again');
  await tick(10 * OFFER_RESEND);
  assert.equal(offers(), 3, 'the later offer was sent again more than once');
});

test('an offer is sent again at most once, however many keys arrive', async () => {
  const { peers, offers } = await offering();
  for (let i = 0; i < 5; i++) { await peers.onSignal('b', await firstKey()); await tick(OFFER_RESEND / 4); }
  await tick(10 * OFFER_RESEND);
  assert.equal(offers(), 2);
});

// Qodo's review of d264fe6 on #116: net.js passes on a relay frame from a device that is briefly
// out of presence only if peers.js already holds that device's key
test('linked(peer) is true only once that peer\'s key has arrived', async () => {
  const { peers } = room();
  assert.equal(typeof peers.linked, 'function', 'peers.linked is missing');
  assert.equal(peers.linked('c'), false, 'a device never heard from');
  const before = pcs.length;
  peers.linked('d');
  assert.equal(pcs.length, before, 'asking opened a connection');
  peers.connect('c');
  assert.equal(peers.linked('c'), false, 'a link without a key');
  await giveKey(peers, 'c'); await settle();
  assert.equal(peers.linked('c'), true);
  await peers.onSignal('e', { pub: 'AAAA' }); await settle();      // a bad key
  assert.equal(peers.linked('e'), false, 'a bad key counts as linked');
});

test('a second answer to an offer sent twice is ignored, not an error', async () => {
  const { peers, pc } = await offering();
  await peers.onSignal('b', { desc: { type: 'answer', sdp: 'answer sdp' } });
  await assert.doesNotReject(peers.onSignal('b', { desc: { type: 'answer', sdp: 'answer sdp' } }));
  assert.equal(pc.signalingState, 'stable');
});

// --- Relay frames from a linked device that presence briefly doesn't list (S1.6) ---
// Two real peers.js devices swap keys. b's sealed relay frames to a are caught on `wire`, so a
// test can hand them to a the way net.js does: marked away (true) while presence doesn't list b.
const RELAY_GAP = 45;
const ABSENT_RELAY_TTL = peersMod.ABSENT_RELAY_TTL ?? 5000;
async function pair(opts = {}) {
  const wire = [];
  let a = null, b = null;
  a = createPeers({ myId: 'a', table: 'T', signal: (to, d) => { if (d.pub) b.onSignal('a', d); }, ...opts });
  b = createPeers({ myId: 'b', table: 'T', signal: (to, d) => { if (d.pub) a.onSignal('b', d); else if (d.r) wire.push(d); } });
  a.connect('b'); b.connect('a');
  await waitFor(() => a.linked('b') && b.linked('a'), 'the keys were never swapped');
  const got = [];
  a.on((from, msg, bytes) => got.push({ from, ...msg, size: bytes.length }));
  return { a, b, wire, got };
}
// Runs `send` on b and returns the `count` sealed frames it put on the wire, in order
async function record({ wire }, send, count) {
  const start = wire.length;
  send();
  for (let i = 0; i < 20 * count && wire.length < start + count; i++) { await tick(RELAY_GAP); await waitFor(() => true); }
  assert.equal(wire.length - start, count, 'b never sent all its frames');
  return wire.slice(start);
}
const messages = (p, n) => () => { for (let i = 0; i < n; i++) p.b.send('a', { t: 'm', n: i }); };
const quiet = async () => { await settle(); await waitFor(() => true); await settle(); };

test('relay frames from a linked device that is away are used only once it is back, in the order they came', async () => {
  const p = await pair();
  const frames = await record(p, messages(p, 3), 3);
  for (const f of frames) p.a.onSignal('b', f, true);
  await quiet();
  assert.deepEqual(p.got, [], 'a frame from a device that is away was used before it came back');
  assert.equal(typeof p.a.returned, 'function', 'peers.returned is missing');
  p.a.returned('b');
  await waitFor(() => p.got.length === 3, `got ${p.got.length} of 3 frames`);
  assert.deepEqual(p.got.map((m) => m.n), [0, 1, 2], 'the frames were reordered in the gap');
});

// Qodo's local review of e006f6c: net.js held relay frames from an absent linked id before
// checking them, so a member could forge that id and fill the hold, and the real frames sent
// during the gap were dropped. Frames are now opened first: a forged one never takes a slot.
test('forged relay frames under the id of a device that is away take no slot in its hold', async () => {
  const p = await pair();
  for (let i = 0; i < 200; i++) p.a.onSignal('b', { r: b64(crypto.getRandomValues(new Uint8Array(24 * 1024))) }, true);
  const frames = await record(p, messages(p, 3), 3);
  for (const f of frames) p.a.onSignal('b', f, true);
  await quiet();
  assert.equal(typeof p.a.returned, 'function', 'peers.returned is missing');
  p.a.returned('b');
  await waitFor(() => p.got.length === 3, `the real frames were displaced: got ${p.got.length} of 3`);
  assert.deepEqual(p.got.map((m) => m.n), [0, 1, 2]);
});

test('frames held for a device that is away are capped at ABSENT_RELAY_HOLD and ABSENT_RELAY_BYTES (Rule 3)', async () => {
  for (const name of ['ABSENT_RELAY_HOLD', 'ABSENT_RELAY_BYTES', 'ABSENT_RELAY_TTL']) assert.equal(typeof peersMod[name], 'number', `${name} is a named constant in peers.js`);
  const p = await pair();
  const n = peersMod.ABSENT_RELAY_HOLD + 20;
  for (const f of await record(p, messages(p, n), n)) p.a.onSignal('b', f, true);
  p.a.returned('b');
  await waitFor(() => p.got.length >= peersMod.ABSENT_RELAY_HOLD, 'the held frames never came through', 5000);
  await quiet();
  assert.equal(p.got.length, peersMod.ABSENT_RELAY_HOLD, 'held more frames than ABSENT_RELAY_HOLD');
  assert.deepEqual(p.got.slice(0, 3).map((m) => m.n), [0, 1, 2], 'the first ones are kept');

  const q = await pair();
  const cs = 96 * 1024, m = Math.ceil(peersMod.ABSENT_RELAY_BYTES / cs) + 5;
  for (const f of await record(q, () => q.b.sendFile('a', 'f', file(m * cs), null, cs), m)) q.a.onSignal('b', f, true);
  q.a.returned('b');
  await waitFor(() => q.got.length > 0, 'nothing held came through', 5000);
  await quiet();
  const bytes = q.got.reduce((s, x) => s + x.size, 0);
  assert.ok(bytes <= peersMod.ABSENT_RELAY_BYTES, `held ${bytes} bytes`);
  assert.ok(q.got.length < m, 'nothing was dropped at the byte cap');
});

test('frames from a device that stays away past ABSENT_RELAY_TTL are dropped (replay of a departed device)', async () => {
  const p = await pair();
  for (const f of await record(p, messages(p, 2), 2)) p.a.onSignal('b', f, true);
  await quiet();
  await tick(ABSENT_RELAY_TTL + 100);
  assert.equal(typeof p.a.returned, 'function', 'peers.returned is missing');
  p.a.returned('b');
  await quiet();
  assert.deepEqual(p.got, [], 'frames held past ABSENT_RELAY_TTL were used');
});

test('a presence gap as long as ABSENT_RELAY_TTL loses no paced relay chunks', async () => {
  const p = await pair();
  const n = Math.ceil(ABSENT_RELAY_TTL / RELAY_GAP), cs = 24 * 1024;   // RELAY_CHUNK at the relay's pace
  for (const f of await record(p, () => p.b.sendFile('a', 'f', file(n * cs), null, cs), n)) p.a.onSignal('b', f, true);
  assert.equal(typeof p.a.returned, 'function', 'peers.returned is missing');
  p.a.returned('b');
  await waitFor(() => p.got.length === n, `chunks from a short presence gap were dropped: got ${p.got.length} of ${n}`, 5000);
});

// Qodo's local review of e006f6c: held frames were released by calling the async onSignal once
// per frame without waiting, so their decryptions raced and a later move could be applied
// before an earlier one. A big frame followed by a small one shows the race.
test('relay frames from one device are used in the order they came, even when a later one opens sooner', async () => {
  for (const away of [false, true]) {
    const p = await pair();
    const cs = 96 * 1024;
    const frames = [...await record(p, () => p.b.sendFile('a', 'f', file(cs), null, cs), 1), ...await record(p, messages(p, 1), 1)];
    for (let i = 0; i < 20; i++) for (const f of frames) p.a.onSignal('b', f, away);   // not awaited, as net.js passes them
    if (away) { assert.equal(typeof p.a.returned, 'function', 'peers.returned is missing'); p.a.returned('b'); }
    await waitFor(() => p.got.length === 40, `got ${p.got.length} of 40 frames`, 5000);
    const order = p.got.map((m) => m.t).join(' ');
    assert.equal(order, Array(20).fill('chunk m').join(' '), `${away ? 'released' : 'live'} frames were used out of order`);
  }
});

// --- Qodo's local review of 09733ec: the receive chain ---
// Holds every AES-GCM open back until the returned function is called, so a test can pile frames
// up behind slow decryption the way a busy phone or a flood of forged frames would.
function stallOpens() {
  let go; const gate = new Promise((r) => { go = r; });
  const real = crypto.subtle.decrypt;
  const m = mock.method(crypto.subtle, 'decrypt', async function (...args) { await gate; return real.apply(this, args); });
  return () => { go(); m.mock.restore(); };
}
// Real time: lets WebCrypto, which runs outside the mocked clock, finish
const pause = (ms) => new Promise((r) => { const t = Date.now(); const loop = () => (Date.now() - t >= ms ? r() : setImmediate(loop)); loop(); });
const RELAY_RX = peersMod.RELAY_RX ?? 400, RELAY_RX_BYTES = peersMod.RELAY_RX_BYTES ?? 16 * 1024 * 1024;

// High: every relay frame went on the chain before it was opened, with no cap, so frames claiming
// a linked device's id piled up in memory behind slow decryption
test('relay frames from one device waiting to be opened are capped at RELAY_RX and RELAY_RX_BYTES (Rule 3)', async () => {
  const p = await pair();
  const [f] = await record(p, messages(p, 1), 1);
  let release = stallOpens();
  for (let i = 0; i < RELAY_RX + 20; i++) p.a.onSignal('b', f);
  await quiet(); release();
  await waitFor(() => p.got.length >= RELAY_RX, `got ${p.got.length} of ${RELAY_RX}`, 5000);
  await pause(100);
  assert.equal(p.got.length, RELAY_RX, 'more frames waited to be opened than RELAY_RX');

  const q = await pair();
  const cs = 96 * 1024, [g] = await record(q, () => q.b.sendFile('a', 'f', file(cs), null, cs), 1);
  const fit = Math.floor(RELAY_RX_BYTES / g.r.length);
  release = stallOpens();
  for (let i = 0; i < fit + 5; i++) q.a.onSignal('b', g);
  await quiet(); release();
  await waitFor(() => q.got.length >= fit, `got ${q.got.length} of ${fit}`, 5000);
  await pause(100);
  assert.equal(q.got.length, fit, 'more bytes waited to be opened than RELAY_RX_BYTES');
  for (const name of ['RELAY_RX', 'RELAY_RX_BYTES']) assert.equal(typeof peersMod[name], 'number', `${name} is a named constant in peers.js`);
});

// Medium: the hold's ABSENT_RELAY_TTL started only once a frame had been opened
test('a frame from a device that is away expires ABSENT_RELAY_TTL after it came, however long it took to open', async () => {
  const p = await pair();
  const frames = await record(p, messages(p, 2), 2);
  const release = stallOpens();
  for (const f of frames) p.a.onSignal('b', f, true);
  await quiet();
  await tick(ABSENT_RELAY_TTL + 100);
  release();
  await pause(200);
  p.a.returned('b');
  await pause(200);
  assert.deepEqual(p.got, [], 'a frame that came more than ABSENT_RELAY_TTL ago was used');
});

// Medium: returned() released the hold later, on the chain, without checking that the device was
// still there by then
test('frames held while a device was away are not used if it has gone again by the time they would be', async () => {
  let here = true;
  const p = await pair({ present: () => here });
  const frames = await record(p, messages(p, 2), 2);
  const release = stallOpens();
  for (const f of frames) p.a.onSignal('b', f, true);
  p.a.returned('b');   // presence lists b again…
  here = false;        // …and then doesn't, before the frames have been opened
  release();
  await pause(200);
  assert.deepEqual(p.got, [], 'held frames were used while the device was away again');
});

// Blind review of 1523354 (Medium): returned() stopped the hold's ABSENT_RELAY_TTL timer only when
// its turn came on the receive chain, so slow opens ahead of it let the timer drop the frames of a
// device that had come back in time
test('frames held while a device was away are used when it returns in time, even if opening is slow', async () => {
  const p = await pair();
  const frames = await record(p, messages(p, 2), 2);
  const release = stallOpens();                       // a busy phone: decryption is slow
  for (const f of frames) p.a.onSignal('b', f, true);  // b is away
  await quiet();
  await tick(1000);
  p.a.returned('b');                                  // b is back 1 s later, well within ABSENT_RELAY_TTL
  await tick(ABSENT_RELAY_TTL);                       // the frames are still being opened when the TTL passes
  release();
  await waitFor(() => p.got.length === 2, `frames from a device that returned in time were dropped: got ${p.got.length} of 2`, 2000);
  assert.deepEqual(p.got.map((m) => m.n), [0, 1]);
});
