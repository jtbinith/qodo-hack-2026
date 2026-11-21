// Checks for messages from other devices. Anyone who knows a room code can send anything,
// so every kind of message has a check here and nothing is used until it passes. A message
// without a check is dropped.

export const LIMITS = {
  fileBytes: 200 * 1024 * 1024,  // biggest file we'll accept (held in memory while it arrives)
  thumbBytes: 512 * 1024,
  thumbSide: 400,                // widest or tallest thumbnail we'll decode, in pixels (S14)
  chunkSizes: [24 * 1024, 64 * 1024], // the only piece sizes a sender may use
  incoming: 20,                  // transfers arriving at once
  prints: 500,
  missingPerAsk: 300,
  wholeSends: 3,                 // whole files' worth of bytes per device per file in any wholeWindow (S1.5)
  wholeWindow: 60 * 1000,        // ms
  pieceGap: 1000,                // ms between asks with a list of pieces, per device per file (S1.5)
  devices: 20,                   // devices a room holds (PRD S7)
  askRecordsPerDevice: 1000,     // (device, file) counters for one device: 2 per print (a photo and its thumbnail)
  askRecords: 20000,             // counters kept at once: askRecordsPerDevice for every device a room holds
  sweepGap: 1000,                // ms between sweeps for stale counters when the table is full
};

const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isNum = (v, lim = 1e6) => Number.isFinite(v) && Math.abs(v) <= lim;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export const isPid = (v) => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
export const isDevId = (v) => isStr(v, 40);
export const isSha = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

export function validPrint(m) {
  return !!m && isPid(m.pid) && isDevId(m.owner) && isDevId(m.anchor) &&
    isStr(m.name, 200) && typeof m.type === 'string' && m.type.length <= 100 &&
    isInt(m.size, 1, LIMITS.fileBytes) && isInt(m.thumbSize ?? 0, 0, LIMITS.thumbBytes) && isSha(m.sha) &&
    isNum(m.x) && isNum(m.y) && isNum(m.w, 400) && m.w >= 40 && isNum(m.h, 400) && m.h >= 40 &&
    isNum(m.rot, Math.PI) &&
    Array.isArray(m.holders) && m.holders.length <= 50 && m.holders.every(isDevId);
}

export const validMove = (m) => !!m && isPid(m.pid) && isDevId(m.anchor) && isNum(m.x) && isNum(m.y);

// Number of pieces a file of `size` bytes splits into at piece size `cs`.
export const pieceCount = (size, cs) => Math.ceil(size / cs) || 1;

// A piece is only accepted for a transfer we asked for, from the device we asked, with a
// piece size, count and index that fit the size we were told to expect, and exactly the
// length that piece must have (every piece is full except possibly the last).
export function validChunk(m, bytes, expect) {
  if (!expect || !LIMITS.chunkSizes.includes(m.cs)) return false;
  if (!isInt(m.n, 1, 1e6) || m.n !== pieceCount(expect.size, m.cs)) return false;
  if (!isInt(m.i, 0, m.n - 1)) return false;
  const want = m.i < m.n - 1 ? m.cs : expect.size - m.cs * (m.n - 1);
  return bytes instanceof Uint8Array && bytes.length === want;
}

// SHA-256 of a list of byte arrays (or a File/Blob), streamed so big files stay out of memory.
export async function sha256Hex(src) {
  const h = await hashwasm.createSHA256();
  h.init();
  if (Array.isArray(src)) for (const part of src) h.update(part);
  else for (let off = 0; off < src.size; off += 4 << 20) h.update(new Uint8Array(await src.slice(off, off + (4 << 20)).arrayBuffer()));
  return h.digest('hex');
}

export function validMissing(list) {
  return list === null || (Array.isArray(list) && list.length <= LIMITS.missingPerAsk && list.every((i) => isInt(i, 0, 1e6)));
}

// Room codes come from the "New room" button: 10 characters from a 32-letter alphabet
// (50 bits), so nobody can guess or list them. Hand-typed short codes are refused.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const isRoomCode = (c) => typeof c === 'string' && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(c);

// A received thumbnail is decoded only if this accepts it (S14): a JPEG, read to its end
// without decoding, with exactly one frame header of a kind we send (baseline, extended or
// progressive) giving a size of at most LIMITS.thumbSide on each side. Anything else (another
// format, a size given later, a second frame, bytes that can't be read) is never decoded,
// so a tiny file claiming enormous dimensions can't use gigabytes while it decodes.
const SOF_OK = [0xc0, 0xc1, 0xc2];
const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
export function thumbFits(b) {
  if (!(b instanceof Uint8Array) || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return false;
  let i = 2, frames = 0, w = 0, h = 0;
  for (;;) {
    if (i + 2 > b.length || b[i] !== 0xff) return false;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }                                 // fill byte
    if (m === 0xd9) { if (i + 2 !== b.length) return false; break; }   // end of image, and nothing after it (no gain map)
    if (m === 0xd8 || m === 0x00 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) return false;
    if (i + 4 > b.length) return false;
    const end = i + 2 + ((b[i + 2] << 8) | b[i + 3]);
    if (end < i + 4 || end > b.length) return false;
    if (m === 0xde || m === 0xdf || (isSof(m) && !SOF_OK.includes(m))) return false;   // hierarchical, lossless, arithmetic
    if (isSof(m)) {
      if (++frames > 1 || end < i + 10) return false;
      h = (b[i + 5] << 8) | b[i + 6]; w = (b[i + 7] << 8) | b[i + 8];
    }
    i = end;
    if (m === 0xda) {                                                  // scan data runs to the next real marker
      for (;;) {
        i = b.indexOf(0xff, i);
        if (i < 0 || i + 1 >= b.length) return false;
        const n = b[i + 1];
        if (n !== 0x00 && !(n >= 0xd0 && n <= 0xd7)) break;
        i += 2;
      }
    }
  }
  return frames === 1 && w >= 1 && h >= 1 && w <= LIMITS.thumbSide && h <= LIMITS.thumbSide;
}

// File ids on the wire: a print id, or "thumb:" + a print id for its thumbnail.
export const isFid = (v) => isPid(v) || (typeof v === 'string' && v.startsWith('thumb:') && isPid(v.slice(6)));

// want / have / dropcheck carry just a print id.
export const validPidMsg = (m) => !!m && isPid(m.pid);
// a need with an empty list asks for nothing, so a real receiver never sends one (second blind review 2)
export const validNeed = (m) => !!m && isFid(m.fid) && validMissing(m.missing) && m.missing?.length !== 0 && (m.cs === undefined || LIMITS.chunkSizes.includes(m.cs));
// Is this device in the room? Only its own entry counts, not a name every object has (second blind review 2)
export const inRoom = (peers, id) => !!peers && Object.hasOwn(peers, id);

// What a device says about itself when it joins the room (presence).
export const validPeerMeta = (m) => !!m && isStr(m.name, 40) && isNum(m.w, 20000) && m.w >= 100 && isNum(m.h, 20000) && m.h >= 100 && isNum(m.joinedAt, 1e15);

// Clock sync with the time keeper.
export const validPing = (p) => !!p && isDevId(p.from) && isDevId(p.to) && isNum(p.t0, 1e15);
export const validPong = (p) => !!p && isDevId(p.to) && isNum(p.t0, 1e15) && isNum(p.t1, 1e15);

// Join results the time keeper announces. Each names the pushes it answers by the time the
// device put on its push. (The join itself is checked by isValidJoins in web/layout.js.)
export const validJoined = (p) => !!p && isNum(p.tA, 1e15) && isNum(p.tB, 1e15);
export const validNoMatch = (p) => !!p && isDevId(p.dev) && isNum(p.t, 1e15);
export const validRetry = (p) => !!p && Array.isArray(p.devs) && p.devs.length <= 50 && p.devs.every(isDevId) &&
  Array.isArray(p.pushes) && p.pushes.length > 0 && p.pushes.length <= 50 &&
  p.pushes.every((q) => !!q && p.devs.includes(q.dev) && isNum(q.t, 1e15));

// Connection setup and relayed frames (exactly one kind per message).
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const isB64 = (v, max) => typeof v === 'string' && v.length <= max && B64.test(v);
export function validSignal(env) {
  if (!env || !isDevId(env.from) || !isDevId(env.to) || !env.data || typeof env.data !== 'object') return false;
  const d = env.data, kinds = ['pub', 'r', 'desc', 'cand'].filter((k) => k in d);
  if (kinds.length !== 1) return false;
  switch (kinds[0]) {
    case 'pub': return isB64(d.pub, 200) && (d.reply === undefined || d.reply === true);
    case 'r': return isB64(d.r, 128 * 1024);
    case 'desc': return !!d.desc && (d.desc.type === 'offer' || d.desc.type === 'answer') && typeof d.desc.sdp === 'string' && d.desc.sdp.length <= 20000;
    case 'cand': return !!d.cand && typeof d.cand.candidate === 'string' && d.cand.candidate.length <= 2000;
  }
  return false;
}

// Resend requests (S1.5). How many bytes a want or need for a file of `size` bytes asks us to
// send: the whole file for a want or a need with no list, and the listed pieces for a need with
// a list (at most the file). null (drop it) if the list repeats a piece or names one past the
// end: a real receiver never does. A list without a piece size is counted at the biggest piece
// size, the most it could make us send. Every ask is charged at least one piece, and at least a
// byte, so even a zero-byte file has a budget (second blind review 1).
export function askBytes(m, size) {
  const cs = m.cs || Math.max(...LIMITS.chunkSizes), piece = Math.max(1, Math.min(size, cs));
  if (m.t === 'want' || m.missing === null) return Math.max(1, size);
  const n = pieceCount(size, cs);
  if (new Set(m.missing).size !== m.missing.length || m.missing.some((i) => i >= n)) return null;
  return Math.max(piece, Math.min(size, m.missing.length * cs));
}

// Counts what each device has asked us to send, per file: one budget of LIMITS.wholeSends whole
// files' worth of bytes in any LIMITS.wholeWindow, whether asked for whole or in pieces (blind
// review 1, 4), and a list ask at most once every LIMITS.pieceGap. allow() is called once a
// request has passed its checks and we hold the file; it returns a token, or null if refused.
// Only allowed requests are counted, so a device that keeps asking can't keep itself locked out.
//
// The table never fills for real: one device can hold at most LIMITS.askRecordsPerDevice
// counters, more than it could honestly use (a photo and a thumbnail per print), and the table
// holds that many for every device a room can have (LIMITS.devices, PRD S7). A live counter is
// never pushed out, or other devices asking could reset a device's limit (Qodo on #87): stale
// ones go, at most once every LIMITS.sweepGap, and if the table is still full the new (device,
// file) is refused. Counters aren't deleted when a device leaves, so leaving and rejoining
// doesn't reset them (blind review 3); they go stale. undo(token, share) gives back the share
// of exactly that send which never left, and nothing if its counter has been replaced (blind
// review 6).
export function askLimiter(now = () => performance.now()) {
  const recs = new Map();   // 'dev fid' -> { dev, sends: [{ t, bytes }], piece: time of the last list ask }
  const perDev = new Map(); // dev -> how many counters it has
  let swept = -Infinity;
  const recent = (r, t) => (r.sends = r.sends.filter((d) => t - d.t < LIMITS.wholeWindow));
  const live = (r, t) => recent(r, t).length > 0 || t - r.piece < LIMITS.pieceGap;
  const drop = (k, r) => { recs.delete(k); const n = perDev.get(r.dev) - 1; if (n > 0) perDev.set(r.dev, n); else perDev.delete(r.dev); };
  const full = (dev) => recs.size >= LIMITS.askRecords || (perDev.get(dev) || 0) >= LIMITS.askRecordsPerDevice;
  function allow(dev, fid, bytes, size, list) {
    const t = now(), key = dev + ' ' + fid;
    let r = recs.get(key);
    if (r) {
      if (list && t - r.piece < LIMITS.pieceGap) return null;
      if (recent(r, t).reduce((a, d) => a + d.bytes, 0) + bytes > LIMITS.wholeSends * Math.max(1, size)) return null;
    } else {
      if (full(dev) && t - swept >= LIMITS.sweepGap) { swept = t; for (const [k, o] of recs) if (!live(o, t)) drop(k, o); }
      if (full(dev)) return null;   // every counter in the way is live: refuse, never push one out
      if (bytes > LIMITS.wholeSends * Math.max(1, size)) return null;
      r = { dev, sends: [], piece: -Infinity };
      recs.set(key, r); perDev.set(dev, (perDev.get(dev) || 0) + 1);
    }
    const send = { t, bytes };
    r.sends.push(send);
    const tok = { key, r, send, prevPiece: r.piece, list };
    if (list) r.piece = t;
    return tok;
  }
  // `share` (0 to 1) of the send this token allowed never left: give that much back.
  function undo(tok, share) {
    if (!tok || recs.get(tok.key) !== tok.r || !(share > 0)) return;
    const i = tok.r.sends.indexOf(tok.send);
    if (i < 0) return;   // already outside the window
    if (share >= 1) { tok.r.sends.splice(i, 1); if (tok.list && tok.r.piece === tok.send.t) tok.r.piece = tok.prevPiece; }
    else tok.send.bytes *= 1 - share;
  }
  return { allow, undo, get size() { return recs.size; } };
}
