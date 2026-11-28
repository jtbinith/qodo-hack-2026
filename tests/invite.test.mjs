// Invite (S16, #102): which room a page opens (a link, this tab's stored room or the lobby), the
// invite link, the address bar after joining and when a join counts as joined or failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Imported this way so a missing module fails on an assertion, not on the import
const m = await import('../web/invite.js').catch(() => ({}));
const has = (name) => assert.equal(typeof m[name], 'function', `web/invite.js exports ${name}()`);
const A = 'ABCDEFGHJK', B = 'MNPQRSTUVW';

test('a ?room=CODE&auto link joins that room', () => {
  has('pickRoom');
  assert.deepEqual(m.pickRoom(`?room=${A}&auto`, null), { fill: A, join: A, from: 'link' });
  assert.deepEqual(m.pickRoom(`?room=${A.toLowerCase()}&auto`, null), { fill: A, join: A, from: 'link' });
});

test('a ?room=CODE&auto link wins over the room stored for this tab', () => {
  has('pickRoom');
  assert.deepEqual(m.pickRoom(`?room=${A}&auto`, B), { fill: A, join: A, from: 'link' });
});

test('a reload with no link goes straight back to the stored room', () => {
  has('pickRoom');
  assert.deepEqual(m.pickRoom('', A), { fill: A, join: A, from: 'stored' });
  assert.deepEqual(m.pickRoom('?relay', A), { fill: A, join: A, from: 'stored' });
});

test('a stored code is checked with isRoomCode: a bad one is ignored', () => {
  has('pickRoom');
  for (const bad of ['TEST', 'abcdefghjk', 'ABCDEFGHJ1', 'ABCDEFGHJKL', '', 42, {}]) assert.deepEqual(m.pickRoom('', bad), { fill: '', join: null }, String(bad));
});

test('a bad ?room=…&auto link is still the newer choice: it goes to the join check, not to the stored room', () => {
  has('pickRoom');
  assert.deepEqual(m.pickRoom('?room=TEST&auto', A), { fill: 'TEST', join: 'TEST', from: 'link' });
});

test('a ?room=CODE link without &auto only fills the lobby, even with a stored room', () => {
  has('pickRoom');
  assert.deepEqual(m.pickRoom(`?room=${A}`, B), { fill: A, join: null, from: 'link' });
  assert.deepEqual(m.pickRoom(`?room=${A}`, null), { fill: A, join: null, from: 'link' });
});

test('nothing stored and no link: an empty lobby', () => {
  has('pickRoom');
  assert.deepEqual(m.pickRoom('', null), { fill: '', join: null });
});

test('the invite link is the page with ?room=CODE&auto and nothing else', () => {
  has('inviteLink');
  assert.equal(m.inviteLink('https://jtbinith.github.io/qodo-hack-2026/', A), `https://jtbinith.github.io/qodo-hack-2026/?room=${A}&auto`);
  assert.equal(m.inviteLink(`http://127.0.0.1:5199/index.html?room=${B}&auto&relay#x`, A), `http://127.0.0.1:5199/index.html?room=${A}&auto`);
});

test('after joining the address bar loses room and auto and keeps the rest', () => {
  has('cleanUrl');
  assert.equal(m.cleanUrl(`http://127.0.0.1:5199/index.html?room=${A}&auto`), '/index.html');
  assert.equal(m.cleanUrl(`http://127.0.0.1:5199/index.html?room=${A}&auto&relay`), '/index.html?relay');
  assert.equal(m.cleanUrl('https://jtbinith.github.io/qodo-hack-2026/?room=' + A), '/qodo-hack-2026/');
  assert.doesNotMatch(m.cleanUrl(`http://x/?a=1&room=${A}&auto#h`), new RegExp(A));
});

// A fake room: `fire(status)` is what net.js emits as ('status', status)
function fakeNet() {
  const listeners = new Set();
  return { on: (f) => listeners.add(f), fire: (st) => listeners.forEach((f) => f('status', st)), other: (ev) => listeners.forEach((f) => f(ev, {})) };
}
function fakeTimers() {
  const t = { next: 1, live: new Map(), set: (f, ms) => { const h = t.next++; t.live.set(h, { f, ms }); return h; }, clear: (h) => t.live.delete(h), run: () => { for (const [h, { f }] of [...t.live]) { t.live.delete(h); f(); } } };
  return t;
}
function watch(opts = {}) {
  const net = fakeNet(), timers = fakeTimers(), log = [];
  const w = m.watchJoin(net, { joined: () => log.push('joined'), failed: (why) => log.push('failed:' + why), setTimer: timers.set, clearTimer: timers.clear, ...opts });
  return { net, timers, log, w };
}

test('the join counts as joined when the channel reports live, once', () => {
  has('watchJoin');
  const { net, log, timers } = watch();
  net.fire('connecting'); net.other('peers');
  assert.deepEqual(log, []);
  net.fire('live'); net.fire('live');
  assert.deepEqual(log, ['joined']);
  assert.equal(timers.live.size, 0, 'the time limit is cleared once joined');
});

test('channel_error, timed_out or closed before live is a failed join, once', () => {
  has('watchJoin');
  for (const st of ['channel_error', 'timed_out', 'closed']) {
    const { net, log, timers } = watch();
    net.fire(st); net.fire(st);
    assert.deepEqual(log, ['failed:' + st]);
    assert.equal(timers.live.size, 0);
  }
});

test('a late live from a failed attempt is ignored', () => {
  has('watchJoin');
  const { net, log } = watch();
  net.fire('channel_error'); net.fire('live');
  assert.deepEqual(log, ['failed:channel_error']);
});

test('a drop after live is not a failed join (the socket rejoins by itself)', () => {
  has('watchJoin');
  const { net, log } = watch();
  net.fire('live'); net.fire('closed'); net.fire('channel_error'); net.fire('live');
  assert.deepEqual(log, ['joined']);
});

test('a join that never reports anything fails after JOIN_TIMEOUT', () => {
  has('watchJoin');
  assert.ok(Number.isInteger(m.JOIN_TIMEOUT) && m.JOIN_TIMEOUT >= 10000, 'JOIN_TIMEOUT is a named limit of at least 10 s');
  const { net, log, timers } = watch();
  assert.deepEqual([...timers.live.values()].map((x) => x.ms), [m.JOIN_TIMEOUT]);
  timers.run();
  assert.deepEqual(log, ['failed:timeout']);
  net.fire('live');
  assert.deepEqual(log, ['failed:timeout'], 'a live after the time limit is ignored');
});

test('stop() abandons the attempt: nothing more is reported', () => {
  has('watchJoin');
  const { net, log, timers, w } = watch();
  w.stop();
  net.fire('live'); timers.run();
  assert.deepEqual(log, []);
  assert.equal(timers.live.size, 0);
});
