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

test('a second answer to an offer sent twice is ignored, not an error', async () => {
  const { peers, pc } = await offering();
  await peers.onSignal('b', { desc: { type: 'answer', sdp: 'answer sdp' } });
  await assert.doesNotReject(peers.onSignal('b', { desc: { type: 'answer', sdp: 'answer sdp' } }));
  assert.equal(pc.signalingState, 'stable');
});
