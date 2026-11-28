// Links between everyone at the table. Two ways to reach a device:
//   1. direct: a WebRTC data channel (fast; fails on hotel Wi-Fi, mobile data, etc.)
//   2. relay: through the room server (Supabase), end-to-end encrypted with seal.js so the
//      server only sees ciphertext. Used whenever the direct link isn't open.
// Both carry the same frames: [4-byte header length][JSON header][payload bytes].
//
// Direct links use "perfect negotiation": either side may start; if both start at once the
// "polite" side (smaller id) backs off.

import { makeKeyPair, deriveKey, seal, open, b64, unb64 } from './seal.js';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const DIRECT_CHUNK = 64 * 1024;
const RELAY_CHUNK = 24 * 1024;   // keeps each relay message well under the server's size limit
const RELAY_GAP = 45;            // ms between relay messages (stays under the server's rate limit)
const HOLD = 400;                // relay frames held per peer while its key is on the way (each ≤ 24 KB)
const HIGH_WATER = 1 << 20;
const SEND_TIMEOUT = 10000;      // ms a send waits on one device with no progress before giving up (S1.3)
const DRAIN_CHECK = 1000;        // ms between checks that a full direct buffer is still draining
// The other device drops our setup until its presence lists us (S1.6, web/net.js), so an early
// offer can be lost. Any key from it (first-time or reply, before or after our offer) means it
// has seen us: once we have both its key and an offer of ours waiting, that offer is sent once
// more OFFER_RESEND later if it is still the one waiting. Without this the pair would stay on the relay
export const OFFER_RESEND = 3000;
// A linked device can drop out of the room's presence for a moment mid-transfer (its socket
// rejoins). web/net.js then passes its relay frames on marked away. Each is opened first, so a
// forged one is dropped and takes no slot. The real ones are held, at most ABSENT_RELAY_HOLD
// frames and ABSENT_RELAY_BYTES per device for ABSENT_RELAY_TTL ms, and used only if net.js says
// the device is back in time (returned). None is used while it is away, so a member can't replay
// a departed device's recorded frames under its id. The caps fit ABSENT_RELAY_TTL of relay
// chunks at RELAY_GAP pace (one 24 KiB chunk per 45 ms)
export const ABSENT_RELAY_HOLD = 120, ABSENT_RELAY_BYTES = 4 * 1024 * 1024, ABSENT_RELAY_TTL = 5000;
// Relay frames from one device that have arrived but not yet been used (still being opened, or
// waiting for an earlier one): at most RELAY_RX frames and RELAY_RX_BYTES of sealed base64 per
// device. Anything over is dropped on arrival, so frames sent under a linked device's id can't
// pile up in memory. RELAY_RX fits a full key-wait inbox (HOLD); paced real traffic never comes close
export const RELAY_RX = HOLD, RELAY_RX_BYTES = 16 * 1024 * 1024;

// A send gave up because the other device stopped answering.
export class SendTimeout extends Error {
  constructor(peer) { super(`no progress from ${peer} for ${SEND_TIMEOUT / 1000} s`); this.name = 'SendTimeout'; this.peer = peer; }
}

// Wait on one device, giving up after SEND_TIMEOUT with no progress. `start(ok, progress)`
// begins the wait: it calls ok(value) when done and progress() to restart the timer, and
// returns a function that cancels the wait.
function waitOn(peer, start) {
  return new Promise((resolve, reject) => {
    let timer, cancel = () => {};
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { cancel(); reject(new SendTimeout(peer)); }, SEND_TIMEOUT); };
    arm();
    cancel = start((v) => { clearTimeout(timer); cancel(); resolve(v); }, arm) || cancel;
  });
}

// `present(peer)` (optional) says whether the room's presence lists `peer` right now
export function createPeers({ myId, table, signal, forceRelay = false, present = () => true }) {
  const links = {};   // peer id -> { pc, dc, open, polite, makingOffer, ignoreOffer, pending, key, keyFailed, outbox, inbox }
  const handlers = new Set(), readyHandlers = new Set();
  const emit = (from, msg, bytes) => handlers.forEach((f) => f(from, msg, bytes));
  const mine = makeKeyPair();

  function link(peer) {
    if (links[peer]) return links[peer];
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const L = links[peer] = { pc, dc: null, open: false, polite: myId < peer, makingOffer: false, ignoreOffer: false, pending: [] };
    // Frames for or from this peer wait here until its key arrives. They never sit in the
    // shared relay queue, so one silent peer can't hold up anyone else.
    L.outbox = []; L.inbox = [];
    // Relay frames from this peer are opened and used one at a time, in the order they came, so a
    // small frame can't overtake a bigger one that is still being opened. Per peer: a slow one
    // holds up only its own frames. `away` holds frames that came while the peer was away.
    // `rxCount`/`rxBytes`: frames on the chain not yet used (RELAY_RX, RELAY_RX_BYTES)
    L.rx = Promise.resolve(); L.away = null; L.rxCount = 0; L.rxBytes = 0;
    mine.then(({ pub }) => signal(peer, { pub: b64(pub) }));     // swap public keys
    const attach = (dc) => {
      L.dc = dc;
      dc.binaryType = 'arraybuffer';
      dc.bufferedAmountLowThreshold = HIGH_WATER / 2;
      dc.onopen = () => { L.open = !forceRelay; }; // forceRelay: test the encrypted relay path
      dc.onclose = () => { L.open = false; };
      dc.onmessage = (e) => onFrame(peer, new Uint8Array(e.data));
    };
    if (myId < peer) attach(pc.createDataChannel('table', { ordered: true }));
    pc.ondatachannel = (e) => attach(e.channel);
    pc.onicecandidate = ({ candidate }) => candidate && signal(peer, { cand: candidate.toJSON() });
    pc.onnegotiationneeded = async () => {
      try {
        L.makingOffer = true; await pc.setLocalDescription();
        if (pc.signalingState === 'have-local-offer') L.offerNo = (L.offerNo || 0) + 1;
        signal(peer, { desc: pc.localDescription.toJSON() });
        resendLater(peer, L);
      } finally { L.makingOffer = false; }
    };
    return L;
  }
  // Once per offer, so a device's keys can't make us repeat it (only our own negotiations make
  // new offers). It runs when either half arrives (our offer, or any key from the other device)
  // and sends again only the offer that was waiting then, if it is still waiting
  function resendLater(peer, L) {
    const pc = L.pc, n = L.offerNo;
    if (L.resentOffer === n || !L.heard || !n || pc.signalingState !== 'have-local-offer') return;
    L.resentOffer = n;
    setTimeout(() => {
      if (L.offerNo === n && pc.signalingState === 'have-local-offer' && pc.localDescription) signal(peer, { desc: pc.localDescription.toJSON() });
    }, OFFER_RESEND);
  }

  // `away` (from web/net.js): a relay frame from a peer presence doesn't list right now
  async function onSignal(from, data, away = false) {
    const L = link(from), pc = L.pc;
    if (data.pub) {
      // Answer a first-time key with ours, in case our earlier one was sent before they
      // were listening (a device that just joined can miss it). Replies aren't answered.
      if (!data.reply) mine.then(({ pub }) => signal(from, { pub: b64(pub), reply: true }));
      L.heard = true;                       // it has seen us: an offer it lost can be sent again
      resendLater(from, L);
      if (L.key || L.keyFailed) return;     // first key wins; ignore later swaps
      try {
        const { kp } = await mine;
        L.key = await deriveKey(kp, unb64(data.pub), { table, a: myId, b: from });
      } catch (e) {
        L.keyFailed = true;                 // malformed key: stop waiting on this peer
        console.warn('bad key from', from, e);
      }
      keyArrived(from, L);
    } else if (data.r) {                    // relayed, encrypted frame
      if (L.keyFailed) return;
      if (!L.key) { if (!away && L.inbox.length < HOLD) L.inbox.push(data.r); return; }
      await received(from, L, data.r, away);
    } else if (data.desc) {
      // an answer to an offer already answered (we sent it twice: OFFER_RESEND) has nothing to do
      if (data.desc.type === 'answer' && pc.signalingState !== 'have-local-offer') return;
      const collision = data.desc.type === 'offer' && (L.makingOffer || pc.signalingState !== 'stable');
      L.ignoreOffer = !L.polite && collision;
      if (L.ignoreOffer) return;
      await pc.setRemoteDescription(data.desc);
      // candidates that arrived before this description can be applied now
      for (const c of L.pending.splice(0)) { try { await pc.addIceCandidate(c); } catch (e) { console.warn(e); } }
      if (data.desc.type === 'offer') { await pc.setLocalDescription(); signal(from, { desc: pc.localDescription.toJSON() }); }
    } else if (data.cand) {
      // too early (no remote description yet): keep it for later instead of losing it
      if (!pc.remoteDescription) { if (L.pending.length < 50) L.pending.push(data.cand); return; }
      try { await pc.addIceCandidate(data.cand); } catch (e) { if (!L.ignoreOffer) console.warn(e); }
    }
  }

  function onFrame(from, u8) {
    let head;
    try {
      if (u8.length < 4) return;
      const n = new DataView(u8.buffer, u8.byteOffset).getUint32(0);
      if (n > 4096 || 4 + n > u8.length) return;          // header must fit and stay small
      head = JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + n)));
      if (!head || typeof head !== 'object') return;
      emit(from, head, u8.subarray(4 + n));
    } catch (e) { console.warn('bad frame from', from, e); }
  }
  function frame(head, bytes = new Uint8Array(0)) {
    const h = new TextEncoder().encode(JSON.stringify(head));
    const buf = new Uint8Array(4 + h.length + bytes.length);
    new DataView(buf.buffer).setUint32(0, h.length);
    buf.set(h, 4); buf.set(bytes, 4 + h.length);
    return buf;
  }

  // A relay frame from the peer. Everything about it is decided now, when it arrives, before any
  // wait: whether it fits (RELAY_RX, RELAY_RX_BYTES), whether the peer was away and which hold it
  // belongs to (so its ABSENT_RELAY_TTL counts from now). It starts opening at once, so a slow or
  // forged frame ahead of it doesn't add its own decryption time, and is used in arrival order
  function received(from, L, r, away = false) {
    if (L.rxCount >= RELAY_RX || L.rxBytes + r.length > RELAY_RX_BYTES) return L.rx;  // dropped, takes no slot
    L.rxCount++; L.rxBytes += r.length;
    const h = away ? awayHold(L) : null;
    const opened = (async () => open(L.key, unb64(r), from, myId))().catch(() => null);  // null: tampered or not for us
    L.rx = L.rx.then(() => opened).then((frame) => {
      L.rxCount--; L.rxBytes -= r.length;
      if (!frame) return;
      if (h) holdAway(h, frame); else onFrame(from, frame);
    }).catch((e) => console.warn('bad relay frame from', from, e));
    return L.rx;
  }
  // The peer's current hold, or a new one that lives ABSENT_RELAY_TTL from now
  function awayHold(L) {
    if (L.away) return L.away;
    const h = L.away = { list: [], bytes: 0, live: true };
    h.timer = setTimeout(() => { h.live = false; if (L.away === h) L.away = null; }, ABSENT_RELAY_TTL);
    return h;
  }
  // A frame whose hold has expired or been released, or that doesn't fit, is dropped and takes no slot
  function holdAway(h, frame) {
    if (!h.live || h.list.length >= ABSENT_RELAY_HOLD || h.bytes + frame.length > ABSENT_RELAY_BYTES) return;
    h.list.push(frame); h.bytes += frame.length;
  }
  // web/net.js: presence lists this peer again. The hold is closed now: frames that come away
  // after this start a new one, and its ABSENT_RELAY_TTL stops now, because the peer came back in
  // time however long the frames ahead take to open. What it held is used after any frame still
  // being opened and before any that comes later, and only if presence still lists the peer by then
  function returned(peer) {
    const L = links[peer], h = L?.away;
    if (!h) return;
    L.away = null;
    clearTimeout(h.timer);
    L.rx = L.rx.then(() => {
      const ok = h.live && present(peer);
      h.live = false;
      if (ok) for (const f of h.list) onFrame(peer, f);
    });
  }
  // A peer's key has arrived (or turned out bad): deliver what was waiting for it.
  async function keyArrived(peer, L) {
    const out = L.outbox.splice(0), inb = L.inbox.splice(0);
    if (!L.key) { out.forEach((o) => o.done(false)); return; } // bad key: drop, but don't leave senders hanging
    for (const o of out) o.done(enqueue(peer, L, o.buf));  // stops its timer: the shared queue isn't a wait on the device
    readyHandlers.forEach((f) => f(peer));                 // anything dropped while waiting can be sent again
    for (const r of inb) received(peer, L, r);
    await L.rx;
  }

  // One relay queue for the whole page, paced so we don't trip the server's rate limit.
  // Only frames whose key is ready go in it. Resolves true once the frame is sent. A frame
  // that fails (seal or signal throws) rejects only its own send: the queue carries on.
  let relayTail = Promise.resolve();
  function enqueue(peer, L, buf) {
    const sent = relayTail.then(async () => {
      signal(peer, { r: b64(await seal(L.key, buf, myId, peer)) });
      await new Promise((r) => setTimeout(r, RELAY_GAP));
    });
    relayTail = sent.catch(() => {});
    return sent.then(() => true);
  }
  // Resolves true if the frame was sent, false if it was dropped.
  function relay(peer, buf) {
    const L = link(peer);
    if (L.keyFailed) return Promise.resolve(false);
    if (L.key) return enqueue(peer, L, buf);
    if (L.outbox.length >= HOLD) return Promise.resolve(false);
    return waitOn(peer, (done) => {
      const o = { buf, done };
      L.outbox.push(o);
      return () => { const i = L.outbox.indexOf(o); if (i >= 0) L.outbox.splice(i, 1); };   // timed out: never sent
    });
  }

  async function sendFrame(peer, buf) {
    const L = link(peer);
    if (L.open && L.dc.readyState === 'open') {
      if (L.dc.bufferedAmount > HIGH_WATER) await drained(peer, L.dc);
      L.dc.send(buf);
      return true;
    }
    return relay(peer, buf);
  }

  // Wait for a full direct buffer to drain. A slow link that keeps draining restarts the timer.
  function drained(peer, dc) {
    return waitOn(peer, (done, progress) => {
      let last = dc.bufferedAmount;
      const check = setInterval(() => { if (dc.bufferedAmount < last) progress(); last = dc.bufferedAmount; }, DRAIN_CHECK);
      const low = () => done();
      dc.addEventListener('bufferedamountlow', low, { once: true });
      return () => { clearInterval(check); dc.removeEventListener('bufferedamountlow', low); };
    });
  }

  // A short message that can't be sent in time is dropped. Resolves true if it was sent and
  // false if it was dropped, so the caller can send it again (see onReady).
  const send = (peer, msg) => sendFrame(peer, frame(msg)).catch((e) => { console.warn('dropped message to', peer, e.message); return false; });

  // Stream a File/Blob in pieces without loading it all into memory. `only` resends
  // just the listed pieces (after the receiver reports gaps). Rejects with SendTimeout if the
  // device stops answering; the rest of the file is not sent. Says how many of its pieces left:
  // it resolves with { sent, of }, and a failure carries the same as `e.sent` (when the error can
  // hold it), so a caller can give back exactly what never left (Qodo on #87, blind review 7).
  // A relay frame that is dropped (a bad key, a full outbox) resolves false and isn't counted.
  // `stop()`, checked before each piece, ends the send early: the receiver said Stop (3.6)
  async function sendFile(peer, fid, file, only = null, cs = null, stop = null) {
    const L = link(peer);
    cs = cs || (L.open ? DIRECT_CHUNK : RELAY_CHUNK);
    const n = Math.ceil(file.size / cs) || 1;
    const list = only || [...Array(n).keys()];
    let sent = 0;
    try {
      for (const i of list) {
        if (stop?.()) return { sent, of: list.length, stopped: true };
        const bytes = new Uint8Array(await file.slice(i * cs, (i + 1) * cs).arrayBuffer());
        if (await sendFrame(peer, frame({ t: 'chunk', fid, i, n, cs }, bytes))) sent++;
      }
    } catch (e) {
      // an error seen by another send already (shared) gets null: unknown, so nothing is given back
      if (e && typeof e === 'object' && Object.isExtensible(e)) Object.defineProperty(e, 'sent', { value: 'sent' in e ? null : { sent, of: list.length }, configurable: true });
      throw e;
    }
    return { sent, of: list.length };
  }

  return {
    onSignal, send, sendFile,
    connect: (peer) => link(peer),
    linked: (peer) => !!links[peer]?.key,   // holds this peer's key; asking opens nothing (web/net.js)
    returned,
    on: (f) => handlers.add(f),
    onReady: (f) => readyHandlers.add(f),   // f(peer) when a peer's key arrives
    path: (peer) => { const L = links[peer]; return !L ? 'none' : L.open ? 'direct' : L.key ? 'relay (encrypted)' : 'keys…'; },
    state: (peer) => links[peer]?.pc.connectionState || 'none',
  };
}
