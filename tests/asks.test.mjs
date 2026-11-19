// Unit tests for the resend limits in web/check.js (S1.5): a device that keeps asking for the
// same file can't make its holder send it again and again, whole or in pieces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askBytes, askLimiter, pieceCount, validPrint, validNeed, inRoom, LIMITS } from '../web/check.js';

const clock = () => { let t = 0; const now = () => t; now.at = (ms) => { t = ms; }; return now; };
const SIZE = 10 * 24576, CS = 24576;   // a 10-piece file
// a whole-file ask (a want, or a need with no list) and a need listing `idx` pieces
const whole = (lim, dev = 'b', fid = 'f', size = SIZE) => lim.allow(dev, fid, size, size, false);
const pieces = (lim, idx, dev = 'b', fid = 'f', size = SIZE, cs = CS) =>
  lim.allow(dev, fid, askBytes({ t: 'need', fid, missing: idx, cs }, size), size, true);
const asks = (n, f) => Array.from({ length: n }, f).filter(Boolean).length;

test('the limits are named constants in LIMITS, sized so the table never fills for real', () => {
  assert.equal(LIMITS.wholeSends, 3);
  assert.equal(LIMITS.wholeWindow, 60000);
  assert.equal(LIMITS.pieceGap, 1000);
  assert.equal(LIMITS.devices, 20, 'PRD S7');
  assert.ok(LIMITS.askRecordsPerDevice >= 2 * LIMITS.prints, 'a photo and a thumbnail for every print');
  assert.ok(LIMITS.askRecords >= LIMITS.askRecordsPerDevice * LIMITS.devices, 'every device a room holds');
  assert.ok(Number.isInteger(LIMITS.sweepGap) && LIMITS.sweepGap > 0);
});

test('a want or a need with no list asks for the whole file; a list for its pieces, at most the file', () => {
  assert.equal(askBytes({ t: 'want', pid: 'p' }, SIZE), SIZE);
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: null, cs: CS }, SIZE), SIZE);
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: [0, 1, 2], cs: CS }, SIZE), 3 * CS);
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: [...Array(10).keys()], cs: CS }, SIZE), SIZE);
});
test('a need whose list repeats a piece or names one past the end is dropped', () => {
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: [1, 1], cs: CS }, SIZE), null, 'repeated piece');
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: Array(5).fill(0), cs: CS }, SIZE), null, 'one piece five times');
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: [10], cs: CS }, SIZE), null, 'past the end');
});
test('a need list without a piece size is counted at the biggest piece size, the most it could send', () => {
  const big = Math.max(...LIMITS.chunkSizes), size = 10 * big, n = pieceCount(size, big);
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: [0, 1] }, size), 2 * big);
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: [n] }, size), null);
});

test('at most 3 whole files per device per file in any 60 s', () => {
  const now = clock(), lim = askLimiter(now);
  assert.equal(asks(20, () => whole(lim)), 3);
  now.at(59999);
  assert.equal(whole(lim), null);
});
test('after 60 s the same device can ask again', () => {
  const now = clock(), lim = askLimiter(now);
  asks(3, () => whole(lim));
  now.at(60000);
  assert.equal(asks(5, () => whole(lim)), 3);
});
test('the window slides: each send frees its place 60 s after it was allowed', () => {
  const now = clock(), lim = askLimiter(now);
  whole(lim); now.at(20000); whole(lim); now.at(40000); whole(lim);
  now.at(60000);
  assert.equal(asks(5, () => whole(lim)), 1, 'only the first send has expired');
});
test('dropped requests do not count, so a device cannot keep itself locked out', () => {
  const now = clock(), lim = askLimiter(now);
  asks(3, () => whole(lim));
  for (let t = 1000; t < 60000; t += 1000) { now.at(t); whole(lim); }   // keeps asking, all dropped
  now.at(60000);
  assert.ok(whole(lim));
});
test('the limit is per device and per file', () => {
  const now = clock(), lim = askLimiter(now);
  asks(20, () => whole(lim));
  assert.ok(whole(lim, 'c'), 'a second device asking for the same file');
  assert.ok(whole(lim, 'b', 'g'), 'the same device asking for another file');
});

test('a list ask is allowed at most once a second per device per file', () => {
  const now = clock(), lim = askLimiter(now);
  assert.equal(asks(20, () => pieces(lim, [0])), 1);
  now.at(999); assert.equal(pieces(lim, [0]), null);
  now.at(1000); assert.ok(pieces(lim, [0]));
  assert.ok(pieces(lim, [0], 'c'), 'another device');
});
test("the receiver's own retries for a few missing pieces, 1.5 s apart, are never dropped", () => {
  const now = clock(), lim = askLimiter(now), size = 100 * CS;   // a 100-piece file
  let ok = 0;
  for (let k = 0; k < 40; k++) { now.at(k * 1500); if (pieces(lim, [k, k + 50], 'b', 'f', size)) ok++; }   // 80 pieces over 60 s
  assert.equal(ok, 40);
});
test('retries that ask for more than 3 files\' worth in a minute are refused, even a piece at a time', () => {
  const now = clock(), lim = askLimiter(now);
  let ok = 0;
  for (let k = 0; k < 40; k++) { now.at(k * 1500); if (pieces(lim, [k % 10])) ok++; }   // 40 pieces of a 10-piece file
  assert.equal(ok, 30);
});
test('pieces and whole asks share one budget of 3 files', () => {
  const now = clock(), lim = askLimiter(now);
  for (let k = 0; k < 10; k++) { now.at(k * 1000); pieces(lim, [k]); }   // one file's worth in pieces
  assert.equal(asks(5, () => whole(lim)), 2);
});

// blind review 1: alternating half-file lists used to count as "a few pieces" and got 30 files a minute
test('alternating halves of the file stop at 3 files a minute (blind review 1)', () => {
  const now = clock(), lim = askLimiter(now), A = [0, 1, 2, 3, 4], B = [5, 6, 7, 8, 9];
  let sent = 0;
  for (let t = 0; t < 60000; t += 1000) { now.at(t); const idx = (t / 1000) % 2 ? B : A; if (pieces(lim, idx)) sent += idx.length; }
  assert.equal(sent / 10, 3);
});
// blind review 4: 300-piece lists on a big file used to send 1125 MB a minute against 600 MB
test('300-piece lists on a 200 MB file stop at 3 files a minute (blind review 4)', () => {
  const now = clock(), lim = askLimiter(now), cs = 65536, size = LIMITS.fileBytes, n = pieceCount(size, cs);
  let sent = 0;
  for (let t = 0; t < 60000; t += 1000) {
    now.at(t);
    const start = ((t / 1000) * 300) % n, idx = [...Array(300).keys()].map((i) => (start + i) % n);
    if (pieces(lim, idx, 'b', 'big', size, cs)) sent += idx.length * cs;
  }
  assert.ok(sent <= 3 * size, `${(sent / 2 ** 20) | 0} MB in 60 s`);
});

// Counters live for their window whatever the device does; leaving and rejoining is tested in the
// two-browser test, through the page's own presence handling (second blind review 5)
test('a counter keeps its sends for the whole window', () => {
  const now = clock(), lim = askLimiter(now);
  asks(3, () => whole(lim));
  now.at(59999);
  assert.equal(whole(lim), null);
  now.at(60000);
  assert.ok(whole(lim));
});

// second blind review 1: a zero-byte file used to be resendable without limit (0 + 0 > 0 is never true)
test('every ask is charged at least one piece (second blind review 1)', () => {
  assert.equal(askBytes({ t: 'want', pid: 'p' }, 0), 1);
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: null, cs: CS }, 0), 1);
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: [0], cs: CS }, 100), 100, 'a small file: the piece is the file');
  assert.equal(askBytes({ t: 'need', fid: 'p', missing: [0], cs: CS }, SIZE), CS);
});
test('a zero-byte file can be sent at most 3 times a minute (second blind review 1)', () => {
  const now = clock(), lim = askLimiter(now), cost = askBytes({ t: 'want', pid: 'p' }, 0);
  assert.equal(asks(20000, () => lim.allow('b', 'z', cost, 0, false)), 3);
});
test('a print of size 0 is refused (second blind review 1)', () => {
  const p = { t: 'print', pid: '0123456789abcdef', owner: 'x', name: 'empty', type: 'image/jpeg', size: 0,
    sha: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', anchor: 'x', x: 1, y: 1, w: 150, h: 110, rot: 0, holders: ['x'] };
  assert.equal(validPrint(p), false);
  assert.ok(validPrint({ ...p, size: 1 }));
});
// second blind review 2: a need with an empty list cost nothing and kept a counter live for 60 s
test('a need with an empty list is dropped (second blind review 2)', () => {
  assert.equal(validNeed({ t: 'need', fid: '0123456789abcdef', missing: [], cs: CS }), false);
  assert.ok(validNeed({ t: 'need', fid: '0123456789abcdef', missing: [0], cs: CS }));
  assert.ok(validNeed({ t: 'need', fid: '0123456789abcdef', missing: null, cs: CS }));
});
test('only ids really in the room count, not names every object has (second blind review 2)', () => {
  const peers = { a: {}, b: {} };
  for (const id of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty', 'isPrototypeOf',
    'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'])
    assert.equal(inRoom(peers, id), false, id);
  assert.ok(inRoom(peers, 'a'));
  assert.equal(inRoom(undefined, 'a'), false);
});

// Qodo on #87 (7e800d93): a full table must not push out a live counter, or other devices'
// asks reset a device's limit
const fill = (lim, ids, files) => { let n = 0; for (let d = 0; d < ids; d++) for (let f = 0; f < files; f++) if (whole(lim, 'x' + d, 'f' + f)) n++; return n; };
test('live counters are never pushed out, so other devices asking cannot reset a limit (Qodo on #87)', () => {
  const now = clock(), lim = askLimiter(now);
  asks(3, () => whole(lim, 'b', 'big'));
  now.at(5000);
  fill(lim, LIMITS.devices + 5, LIMITS.askRecordsPerDevice);   // more live pairs than the table holds
  assert.equal(whole(lim, 'b', 'big'), null, "b's limit was reset inside its 60 s window");
});
test('one device holds at most askRecordsPerDevice counters; only its own new files are refused (Qodo on #87)', () => {
  const now = clock(), lim = askLimiter(now);
  assert.equal(fill(lim, 1, LIMITS.askRecordsPerDevice + 50), LIMITS.askRecordsPerDevice);
  assert.ok(whole(lim, 'c', 'f0'), 'another device');
  assert.ok(whole(lim, 'x0', 'f0'), 'a file it already has a counter for');
});
// blind review 2: a few ids must not be able to fill the table and refuse every honest device
test('a room of 20 devices each at its cap still leaves room for every one of them (blind review 2)', () => {
  const now = clock(), lim = askLimiter(now);
  fill(lim, LIMITS.devices - 1, LIMITS.askRecordsPerDevice);   // 19 devices, each at its cap
  assert.ok(whole(lim, 'honest', 'p'), 'the 20th device was refused');
});
test('when every counter is live a new one is refused, and allowed once one goes stale (Qodo on #87)', () => {
  const now = clock(), lim = askLimiter(now);
  fill(lim, LIMITS.askRecords / LIMITS.askRecordsPerDevice, LIMITS.askRecordsPerDevice);
  assert.equal(lim.size, LIMITS.askRecords);
  assert.equal(whole(lim, 'z', 'f'), null, 'pushed out a live counter');
  now.at(LIMITS.wholeWindow);
  assert.ok(whole(lim, 'z', 'f'), 'a stale counter made room');
});
// blind review 9: when the table is full, refused asks don't each scan it
test('a full table is swept for stale counters at most once a sweepGap (blind review 9)', () => {
  const now = clock(), lim = askLimiter(now);
  fill(lim, LIMITS.askRecords / LIMITS.askRecordsPerDevice, LIMITS.askRecordsPerDevice);
  const t0 = performance.now();
  for (let k = 0; k < 10000; k++) whole(lim, 'y' + k, 'g');
  assert.ok(performance.now() - t0 < 200, `${(performance.now() - t0) | 0} ms for 10000 refused asks`);
});

// Qodo on #87 (cbfbb88c) and blind review 6: undo gives back exactly the send that never left
test('undo gives back a whole-file send that sent nothing (Qodo on #87)', () => {
  const now = clock(), lim = askLimiter(now);
  const toks = Array.from({ length: 3 }, () => whole(lim));
  lim.undo(toks[1], 1);
  assert.ok(whole(lim));
  assert.equal(whole(lim), null);
});
test('undo gives back only the share that never left', () => {
  const now = clock(), lim = askLimiter(now);
  const tok = whole(lim); whole(lim); whole(lim);
  lim.undo(tok, 0.5);   // half of the first send never left
  assert.equal(whole(lim), null, 'half a file of room is not a whole file');
  assert.ok(pieces(lim, [0, 1, 2, 3, 4]), 'but half a file in pieces fits');
});
test('undo gives back a list ask that sent nothing, including its once-a-second slot (Qodo on #87)', () => {
  const now = clock(), lim = askLimiter(now);
  lim.undo(pieces(lim, [0]), 1);
  assert.ok(pieces(lim, [0]));
});
test('undo removes the failed send itself, not the newest one (blind review 6)', () => {
  const now = clock(), lim = askLimiter(now);
  whole(lim); now.at(50000); const failed = whole(lim); now.at(55000); whole(lim);
  lim.undo(failed, 1);   // the send at 50 s never left
  now.at(60000);         // the send at 0 s has expired; the one at 55 s still counts
  assert.equal(asks(5, () => whole(lim)), 2);
  now.at(110000);        // 55 s and the two at 60 s still count: none allowed. Had undo taken the
  assert.equal(asks(5, () => whole(lim)), 0);   // 55 s send instead, the 50 s one would have expired and 1 would be
});
test('an old token gives nothing back once its counter has been replaced (blind review 6)', () => {
  const now = clock(), lim = askLimiter(now);
  const old = Array.from({ length: 3 }, () => whole(lim, 'b', 'f0'));   // 3 sends in flight, then stalled
  for (let f = 1; f < LIMITS.askRecordsPerDevice; f++) whole(lim, 'b', 'f' + f);   // b at its cap
  now.at(LIMITS.wholeWindow);                    // all of b's counters go stale
  assert.ok(whole(lim, 'b', 'g'), 'a new file: the sweep clears b\'s stale counters');
  assert.equal(asks(5, () => whole(lim, 'b', 'f0')), 3, 'a new counter for f0');
  old.forEach((tok) => lim.undo(tok, 1));        // the old sends fail with nothing sent
  assert.equal(whole(lim, 'b', 'f0'), null, 'the old tokens refunded the new counter');
});
test('undo for a token that is null, or a share of 0, does nothing', () => {
  const now = clock(), lim = askLimiter(now);
  lim.undo(null, 1);
  const tok = whole(lim); lim.undo(tok, 0);
  assert.equal(asks(5, () => whole(lim)), 2);
});
