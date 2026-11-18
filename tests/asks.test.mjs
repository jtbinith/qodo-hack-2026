// Unit tests for the resend limits in web/check.js (S1.5): a device that keeps asking for the
// same file can't make its holder send it again and again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askKind, askLimiter, pieceCount, LIMITS } from '../web/check.js';

const clock = () => { let t = 0; const now = () => t; now.at = (ms) => { t = ms; }; return now; };
const asks = (lim, dev, fid, kind, times) => Array.from({ length: times }, () => lim.allow(dev, fid, kind)).filter(Boolean).length;

test('the limits are named constants in LIMITS', () => {
  assert.equal(LIMITS.wholeSends, 3);
  assert.equal(LIMITS.wholeWindow, 60000);
  assert.equal(LIMITS.pieceGap, 1000);
  assert.ok(Number.isInteger(LIMITS.askRecords) && LIMITS.askRecords > 0);
});

test('a want, a need with no list and a need covering over half the pieces are whole-file sends', () => {
  const size = 10 * 24576, cs = 24576;   // 10 pieces
  assert.equal(askKind({ t: 'want', pid: 'p' }, size), 'whole');
  assert.equal(askKind({ t: 'need', fid: 'p', missing: null, cs }, size), 'whole');
  assert.equal(askKind({ t: 'need', fid: 'p', missing: [0, 1, 2, 3, 4, 5], cs }, size), 'whole');
  assert.equal(askKind({ t: 'need', fid: 'p', missing: [0, 1, 2, 3, 4], cs }, size), 'pieces');
  assert.equal(askKind({ t: 'need', fid: 'p', missing: [9], cs }, size), 'pieces');
});
test('a need whose list repeats a piece or names one past the end is dropped', () => {
  const size = 10 * 24576, cs = 24576;
  assert.equal(askKind({ t: 'need', fid: 'p', missing: [1, 1], cs }, size), null, 'repeated piece');
  assert.equal(askKind({ t: 'need', fid: 'p', missing: Array(5).fill(0), cs }, size), null, 'one piece five times');
  assert.equal(askKind({ t: 'need', fid: 'p', missing: [10], cs }, size), null, 'past the end');
});
test('a need list without a piece size is counted at the biggest piece size (fewest pieces)', () => {
  const big = Math.max(...LIMITS.chunkSizes), size = 10 * big, n = pieceCount(size, big);
  assert.equal(askKind({ t: 'need', fid: 'p', missing: [...Array(n / 2 + 1).keys()] }, size), 'whole');
  assert.equal(askKind({ t: 'need', fid: 'p', missing: [...Array(n / 2).keys()] }, size), 'pieces');
  assert.equal(askKind({ t: 'need', fid: 'p', missing: [n] }, size), null);
});

test('at most 3 whole-file sends per device per file in any 60 s', () => {
  const now = clock(), lim = askLimiter(now);
  assert.equal(asks(lim, 'b', 'f', 'whole', 20), 3);
  now.at(59999);
  assert.equal(lim.allow('b', 'f', 'whole'), false);
});
test('after 60 s the same device can ask again', () => {
  const now = clock(), lim = askLimiter(now);
  asks(lim, 'b', 'f', 'whole', 3);
  now.at(60000);
  assert.equal(asks(lim, 'b', 'f', 'whole', 5), 3);
});
test('the window slides: each send frees its place 60 s after it was allowed', () => {
  const now = clock(), lim = askLimiter(now);
  lim.allow('b', 'f', 'whole'); now.at(20000); lim.allow('b', 'f', 'whole'); now.at(40000); lim.allow('b', 'f', 'whole');
  now.at(60000);
  assert.equal(asks(lim, 'b', 'f', 'whole', 5), 1, 'only the first send has expired');
});
test('dropped requests do not count, so a device cannot keep itself locked out', () => {
  const now = clock(), lim = askLimiter(now);
  asks(lim, 'b', 'f', 'whole', 3);
  for (let t = 1000; t < 60000; t += 1000) { now.at(t); lim.allow('b', 'f', 'whole'); }   // keeps asking, all dropped
  now.at(60000);
  assert.equal(lim.allow('b', 'f', 'whole'), true);
});
test('the limit is per device and per file', () => {
  const now = clock(), lim = askLimiter(now);
  asks(lim, 'b', 'f', 'whole', 20);
  assert.equal(lim.allow('c', 'f', 'whole'), true, 'a second device asking for the same file');
  assert.equal(lim.allow('b', 'g', 'whole'), true, 'the same device asking for another file');
});

test('asks for a few pieces are allowed at most once a second per device per file', () => {
  const now = clock(), lim = askLimiter(now);
  assert.equal(asks(lim, 'b', 'f', 'pieces', 20), 1);
  now.at(999); assert.equal(lim.allow('b', 'f', 'pieces'), false);
  now.at(1000); assert.equal(lim.allow('b', 'f', 'pieces'), true);
  assert.equal(lim.allow('c', 'f', 'pieces'), true, 'another device');
});
test("the receiver's own retries, 1.5 s apart, are never dropped", () => {
  const now = clock(), lim = askLimiter(now);
  let ok = 0;
  for (let k = 0; k < 40; k++) { now.at(k * 1500); if (lim.allow('b', 'f', 'pieces')) ok++; }
  assert.equal(ok, 40);
});
test('piece asks do not use up whole-file sends', () => {
  const now = clock(), lim = askLimiter(now);
  for (let k = 0; k < 10; k++) { now.at(k * 1000); lim.allow('b', 'f', 'pieces'); }
  assert.equal(asks(lim, 'b', 'f', 'whole', 5), 3);
});

test('a device that leaves is forgotten', () => {
  const now = clock(), lim = askLimiter(now);
  asks(lim, 'b', 'f', 'whole', 3); asks(lim, 'b', 'g', 'pieces', 1); asks(lim, 'c', 'f', 'whole', 1);
  lim.forget('b');
  assert.equal(lim.size, 1);
  assert.equal(lim.allow('b', 'f', 'whole'), true);
});
test('the counters are capped in number', () => {
  const now = clock(), lim = askLimiter(now);
  for (let k = 0; k < LIMITS.askRecords + 50; k++) lim.allow('d' + k, 'f', 'whole');
  assert.ok(lim.size > 0 && lim.size <= LIMITS.askRecords, `size ${lim.size}`);
});
test('stale counters are dropped before a live one is pushed out', () => {
  const now = clock(), lim = askLimiter(now);
  asks(lim, 'b', 'f', 'whole', 3);   // live for 60 s, and the oldest counter
  for (let k = 0; k < LIMITS.askRecords - 1; k++) lim.allow('old' + k, 'f', 'pieces');   // stale a second later
  now.at(2000);
  for (let k = 0; k < 10; k++) lim.allow('new' + k, 'f', 'whole');
  assert.equal(lim.allow('b', 'f', 'whole'), false, "b's live counter survived");
});
