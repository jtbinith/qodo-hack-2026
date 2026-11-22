// Unit tests for join results in web/net.js (C15, #68): results count only from the time
// keeper, and a device that pushed gives up by itself when no result names it.
// Several real joinRoom devices share a fake room server, and the clock is mocked so
// seconds pass instantly. The room server takes LAG ms to pass each message on.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const LAG = 100;
let channels = [], presence = {};
class FakeChannel {
  handlers = {};
  on(type, filter, h) { this.handlers[type + ':' + filter.event] = h; return this; }
  send({ event, payload }) {
    if (bus.drop?.(event, payload)) return;
    const copy = JSON.parse(JSON.stringify(payload));
    for (const c of channels) if (c !== this) setTimeout(() => c.handlers['broadcast:' + event]?.({ payload: copy }), LAG);   // self: false
  }
  presenceState() { return Object.fromEntries(Object.entries(presence).map(([k, m]) => [k, [m]])); }
  async track(m) { presence[this.key] = m; for (const c of channels) c.handlers['presence:sync']?.(); }
  subscribe(cb) { cb('SUBSCRIBED'); }
}
const bus = { drop: null };
globalThis.window = { supabase: { createClient: () => ({
  channel: (name, { config }) => { const c = new FakeChannel(); c.key = config.presence.key; channels.push(c); return c; },
  removeChannel() {},
}) } };
const realPerformance = globalThis.performance;
const { joinRoom } = await import('../web/net.js');

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 });
  globalThis.performance = { timeOrigin: 0, now: () => Date.now() };
  channels = []; presence = {}; bus.drop = null;
});
afterEach(() => { mock.timers.reset(); globalThis.performance = realPerformance; });

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
const tick = async (ms) => { for (let k = 0; k < ms; k += 50) { mock.timers.tick(Math.min(50, ms - k)); await settle(); } };

// L arrives first, so it is the time keeper. A, B and C are phones
let start = 0;
async function room() {
  const devs = {};
  for (const [id, w, h] of [['L', 1440, 900], ['A', 400, 800], ['B', 400, 800], ['C', 400, 800]]) {
    const s = joinRoom({ room: 'r', id, name: id.toLowerCase(), size: { w, h } });
    s.heard = []; s.times = [];   // results it heard, and the time of each of its pushes
    s.on((ev, d) => { if (ev === 'pushed') s.times.push(d.t); if (['joined', 'retry', 'nomatch'].includes(ev)) s.heard.push({ ev, d, at: Date.now() - start }); });
    devs[id] = s;
    await tick(1);
  }
  start = Date.now();
  await settle();
  for (const s of Object.values(devs)) assert.equal(s.leader, 'L');
  return devs;
}
const names = (s) => s.heard.map(({ ev, d }) => ev + ' ' + (d.dev || d.devs?.join(',') || d.a + '-' + d.b));
const ownNoMatch = (s) => s.heard.filter(({ ev, d }) => ev === 'nomatch' && d.timedOut);
const joinedAB = (tA, tB) => ({ a: 'A', edgeA: 'R', alongA: 1, tA, b: 'B', edgeB: 'L', alongB: 1, tB });

test('joined, retry and nomatch carry the time keeper id', async () => {
  const { L, A, B, C } = await room();
  const sent = [];
  bus.drop = (event, p) => { if (['joined', 'retry', 'nomatch'].includes(event)) sent.push([event, p]); return false; };
  A.push('L', 400); L.push('R', 450);
  await tick(3000);
  C.push('T', 100);                  // a lone push: nomatch
  await tick(4000);
  L.push('R', 450); A.push('L', 400); B.push('L', 400);   // one laptop push, two phones: retry
  await tick(3000);
  assert.deepEqual(sent.map(([e]) => e).sort(), ['joined', 'nomatch', 'retry']);
  for (const [event, p] of sent) assert.equal(p.from, 'L', `${event} names its sender`);
  // and the pushes it answers, by the time each device put on its push
  const [joined, nomatch, retry] = ['joined', 'nomatch', 'retry'].map((e) => sent.find(([x]) => x === e)[1]);
  assert.deepEqual([joined.tA, joined.tB], [A.times[0], L.times[0]]);
  assert.equal(nomatch.t, C.times[0]);
  assert.deepEqual(retry.pushes, [{ dev: 'L', t: L.times[1] }, { dev: 'A', t: A.times[1] }, { dev: 'B', t: B.times[0] }]);
  assert.deepEqual(names(C), ['joined A-L', 'nomatch C', 'retry L,A,B']);   // the room hears every result
});

test('a joined, retry or nomatch not sent by the time keeper is ignored', async () => {
  const { L, A, B } = await room();
  const fake = channels.find((c) => c.key === 'A');   // A's own channel, sending what only L should
  const forge = (from) => {
    fake.send({ event: 'joined', payload: { ...joinedAB(1, 2), ...(from && { from }) } });
    fake.send({ event: 'retry', payload: { devs: ['B'], pushes: [{ dev: 'B', t: 2 }], ...(from && { from }) } });
    fake.send({ event: 'nomatch', payload: { dev: 'B', t: 2, ...(from && { from }) } });
  };
  forge('A'); forge(undefined);
  await tick(500);
  assert.deepEqual(names(B), [], 'from a device that is not the time keeper, or with no sender');
  assert.deepEqual(names(L), [], 'the time keeper takes results only from itself');
  // This is the rule, not protection: a forged `from` still passes until #24 signs room messages
  forge('L');
  await tick(500);
  assert.deepEqual(names(B), ['joined A-B', 'retry B', 'nomatch B']);
  assert.deepEqual(names(L), [], 'the time keeper ignores results that claim to come from it');
});

test('a push the time keeper drops without a reply ends in this device’s own "No match"', async () => {
  const { A } = await room();
  bus.drop = (event, p) => event === 'push' && p.dev === 'A';   // e.g. a batch that is already full
  A.push('L', 400);
  await tick(5000);
  assert.deepEqual(ownNoMatch(A), [], 'not before the time keeper’s latest possible decision (WINDOW + DEADLINE = 4.5 s) and the network');
  await tick(1000);
  assert.equal(ownNoMatch(A).length, 1, 'by 6 s');
});

test('another pair’s joined doesn’t stop this device’s wait', async () => {
  const { A, B, C } = await room();
  bus.drop = (event, p) => event === 'push' && p.dev === 'A';
  A.push('L', 400); B.push('R', 400); C.push('L', 400);
  await tick(8000);
  assert.deepEqual(names(A).slice(0, 1), ['joined B-C']);
  assert.equal(ownNoMatch(A).length, 1);
});

// A's push is lost, then the time keeper sends one result. Only results naming A stop A's wait
async function waitThen(results) {
  const { A } = await room();
  bus.drop = (event, p) => event === 'push' && p.dev === 'A';
  A.push('L', 400);
  await tick(1000);
  for (const r of results(A.times[0])) channels.find((c) => c.key === 'L').send(r);
  await tick(9000);
  return A;
}
for (const [what, result] of [
  ['a joined naming this push', (t) => ({ event: 'joined', payload: { ...joinedAB(t, 5), from: 'L' } })],
  ['a nomatch naming this push', (t) => ({ event: 'nomatch', payload: { dev: 'A', t, from: 'L' } })],
  ['a retry listing this push', (t) => ({ event: 'retry', payload: { devs: ['B', 'A'], pushes: [{ dev: 'B', t: 5 }, { dev: 'A', t }], from: 'L' } })],
]) test(`${what} stops its wait`, async () => {
  const A = await waitThen((t) => [result(t)]);
  assert.equal(A.heard.length, 1, names(A).join('; '));
  assert.deepEqual(ownNoMatch(A), []);
});
test('a retry or nomatch for other devices doesn’t stop this device’s wait', async () => {
  const A = await waitThen((t) => [{ event: 'retry', payload: { devs: ['B', 'C'], pushes: [{ dev: 'B', t }, { dev: 'C', t }], from: 'L' } },
    { event: 'nomatch', payload: { dev: 'B', t, from: 'L' } }]);
  assert.equal(ownNoMatch(A).length, 1, names(A).join('; '));
});
test('a result for another push from this device doesn’t stop this push’s wait', async () => {
  const A = await waitThen((t) => [{ event: 'joined', payload: { ...joinedAB(t - 1, 5), from: 'L' } },
    { event: 'nomatch', payload: { dev: 'A', t: t - 1, from: 'L' } },
    { event: 'retry', payload: { devs: ['A'], pushes: [{ dev: 'A', t: t - 1 }], from: 'L' } }]);
  assert.equal(ownNoMatch(A).length, 1, names(A).join('; '));
});

// one wait per push (fix round 1)
test('each push has its own wait, which a later push doesn’t restart or cancel', async () => {
  const { A } = await room();
  bus.drop = (event, p) => event === 'push' && p.dev === 'A';
  A.push('L', 400);
  await tick(2000);
  A.push('L', 400);
  await tick(10000);
  assert.deepEqual(ownNoMatch(A).map(({ d, at }) => [d.t, Math.round(at / 100) * 100]), [[A.times[0], 5500], [A.times[1], 7500]]);
});
test('a later push’s wait survives the join of an earlier push', async () => {
  const { L, A } = await room();
  A.push('L', 400); L.push('R', 450);
  await tick(300);
  bus.drop = (event, p) => event === 'push' && p.dev === 'A';   // A taps again before the join is decided, and this tap is lost
  A.push('L', 400);
  await tick(8000);
  assert.deepEqual(names(A).slice(0, 1), ['joined A-L']);
  assert.ok(A.heard[0].at > 300, 'the join came after the second push');
  assert.deepEqual(ownNoMatch(A).map(({ d }) => d.t), [A.times[1]]);
});
test('a late nomatch for an earlier push doesn’t cancel a later push’s wait', async () => {
  const { A } = await room();
  A.push('T', 100);                  // alone: the time keeper says nomatch at about 2.4 s
  await tick(2000);
  bus.drop = (event, p) => event === 'push' && p.dev === 'A';
  A.push('L', 400);                  // lost
  await tick(10000);
  assert.deepEqual(names(A).slice(0, 1), ['nomatch A']);
  assert.deepEqual(ownNoMatch(A).map(({ d }) => d.t), [A.times[1]]);
});

test('a retry is never followed by this device’s own "No match"', async () => {
  const { L, A, B } = await room();
  L.push('R', 450); A.push('L', 400); B.push('L', 400);   // one laptop push answered by two phones
  await tick(10000);
  for (const s of [L, A, B]) assert.deepEqual(names(s), ['retry L,A,B'], s.id);
});

test('in a busy room a late join shows "Joined", never "No match" first', async () => {
  // A pushes at 0 and L answers at 1.95 s. C pushes an edge nobody answers: its first push
  // makes the burst resolve at 1.75 s, before L's push, so A's push waits and a new burst starts.
  // C's later pushes put the decision back to that burst's DEADLINE, about 4.25 s
  const { L, A, C } = await room();
  const at = (ms, f) => setTimeout(f, ms);
  at(0, () => A.push('L', 400));
  at(1950, () => L.push('R', 450));
  for (const ms of [850, 2700, 3500, 4200]) at(ms, () => C.push('T', 100));
  await tick(12000);
  const joined = A.heard.find(({ ev }) => ev === 'joined');
  assert.ok(joined && joined.at > 4000, `the join is decided late (${joined?.at} ms)`);
  assert.equal(A.heard[0].ev, 'joined', names(A).join('; '));
  assert.deepEqual(ownNoMatch(A), []);
});
test('two pushes in the same millisecond share one wait, which their result stops', async () => {
  const { A } = await room();
  bus.drop = (event, p) => event === 'push' && p.dev === 'A';
  A.push('L', 400); A.push('L', 400);   // the mocked clock doesn't move between them
  assert.equal(A.times[0], A.times[1]);
  await tick(1000);
  channels.find((c) => c.key === 'L').send({ event: 'nomatch', payload: { dev: 'A', t: A.times[0], from: 'L' } });
  await tick(9000);
  assert.deepEqual(ownNoMatch(A), [], names(A).join('; '));
});

// fix round 2: the page acts on a result only when it answers this device's latest push
test('results say whether they answer this device’s latest push', async () => {
  const { L, A, B } = await room();
  A.push('L', 400); L.push('R', 450);
  await tick(300);
  bus.drop = (event, p) => event === 'push' && p.dev === 'A';   // A taps again before the join is decided, and this tap is lost
  A.push('L', 400);
  await tick(8000);
  assert.deepEqual(A.heard.map(({ ev, d }) => [ev, d.latest]), [['joined', false], ['nomatch', true]]);
  assert.equal(L.heard[0].d.latest, true, 'the time keeper’s own result for its latest push');
  // a retry for an earlier push, then the latest push's own wait runs out
  bus.drop = (event, p) => event === 'push' && p.dev === 'B';   // both of B's pushes are lost
  B.push('T', 100);
  const t1 = B.times.at(-1);
  await tick(300);
  B.push('L', 400);
  channels.find((c) => c.key === 'L').send({ event: 'retry', payload: { devs: ['B'], pushes: [{ dev: 'B', t: t1 }], from: 'L' } });
  await tick(9000);
  const mine = B.heard.filter(({ ev, d }) => ev === 'retry' || (ev === 'nomatch' && d.dev === 'B'));
  assert.deepEqual(mine.map(({ ev, d }) => [ev, d.latest]), [['retry', false], ['nomatch', true]], names(B).join('; '));
});

// The time keeper leaves and the others hear it at different times (C5, #61). `leaves` takes
// devices out of the room without telling anyone. `hear` tells the devices it names
function leaves(devs, ...gone) {
  for (const id of gone) { delete presence[id]; devs[id].leave(); channels = channels.filter((c) => c.key !== id); }
}
const hear = (...ids) => { for (const id of ids) channels.find((c) => c.key === id).handlers['presence:sync'](); };

test('a device that hears late that the time keeper left still ends up with the new time keeper’s layout', async () => {
  const devs = await room(), { A, B, C } = devs;
  leaves(devs, 'L');
  hear('A');                       // A hears first and takes over. B and C still count L
  await tick(100);
  assert.equal(A.leader, 'A'); assert.equal(B.leader, 'L');
  A.push('R', 400); B.push('L', 400);
  await tick(3000);
  assert.equal(A.joins.length, 1, 'A joined B');
  assert.deepEqual([B.joins, C.joins], [[], []], 'B and C, still counting L, did not use it yet');
  hear('C', 'B');                  // the two hear in the opposite order to the one they arrived in
  await settle();
  assert.deepEqual([B.leader, C.leader], ['A', 'A']);
  assert.deepEqual(B.joins, A.joins, 'B holds A’s layout');
  assert.deepEqual(C.joins, A.joins, 'C holds A’s layout');
});

test('a layout from a device that isn’t the time keeper is still dropped (Rule 1)', async () => {
  const devs = await room(), { A, C } = devs;
  const fromB = (joins) => channels.find((c) => c.key === 'B').send({ event: 'layout', payload: { from: 'B', joins } });
  fromB([{ a: 'B', edgeA: 'R', alongA: 1, b: 'C', edgeB: 'L', alongB: 1 }]);
  await tick(500);
  assert.deepEqual([A.joins, C.joins], [[], []], 'not used while L is the time keeper');
  // L's own layout comes after B's, so what B sent is out of date: when L and A leave and B
  // takes over, C doesn't take up B's old layout
  devs.L.push('R', 450); A.push('L', 400);
  await tick(3000);
  assert.equal(C.joins.length, 1, 'C holds L’s layout');
  leaves(devs, 'L', 'A');
  hear('C');
  await settle();
  assert.equal(C.leader, 'B');
  assert.deepEqual(C.joins, [], 'B’s layout from before L’s was not used');
});

test('a layout kept from the next time keeper is checked again when it takes over', async () => {
  const devs = await room(), { B } = devs;
  // A sends a layout naming C while L is the time keeper. Then L and C leave together
  channels.find((c) => c.key === 'A').send({ event: 'layout', payload: { from: 'A', joins: [{ a: 'B', edgeA: 'R', alongA: 1, b: 'C', edgeB: 'L', alongB: 1 }] } });
  await tick(500);
  leaves(devs, 'L', 'C');
  hear('B');
  await settle();
  assert.equal(B.leader, 'A');
  assert.deepEqual(B.joins, [], 'A’s kept layout names C, which has left, so it is not used');
});

// Qodo on #95: the old time keeper's layout can arrive late, after the new time keeper's and
// before the presence update. It is used, as L is still the time keeper then, and clears what was
// kept from A. When C then hears that L left, it asks A for its layout instead of keeping L's
const deliver = (to, event, payload) => channels.find((c) => c.key === to).handlers['broadcast:' + event]?.({ payload });

test('a late layout from the old time keeper doesn’t leave a device with stale joins', async () => {
  const devs = await room(), { A, B, C } = devs;
  leaves(devs, 'L');
  hear('A');
  await tick(100);
  A.push('R', 400); B.push('L', 400);
  await tick(3000);
  assert.equal(A.joins.length, 1, 'A joined B');
  deliver('C', 'layout', { from: 'L', joins: [] });   // L's layout, sent before it left, arrives now
  assert.equal(C.leader, 'L');
  hear('C');
  await tick(2000);
  assert.equal(C.leader, 'A');
  assert.deepEqual(C.joins, A.joins, 'C asked A and holds its layout');
});

// Qodo on #95, round 2: the room server can drop the ask or its answer. C asks again, at a
// capped number of tries, until A's layout arrives
async function lateOldLayout() {
  const devs = await room(), { A, B, C } = devs;
  leaves(devs, 'L');
  hear('A');
  await tick(100);
  A.push('R', 400); B.push('L', 400);
  await tick(3000);
  deliver('C', 'layout', { from: 'L', joins: [] });
  return devs;
}
const asksFrom = (who) => { const asks = []; return { asks, count: (event, p) => event === 'layoutask' && p.from === who && asks.push(Date.now()) }; };

test('a lost layout ask is sent again, and C still ends with the new time keeper’s layout', async () => {
  const { A, C } = await lateOldLayout();
  const { asks, count } = asksFrom('C');
  bus.drop = (event, p) => count(event, p) && asks.length === 1;   // the first ask is lost
  hear('C');
  await tick(6000);
  assert.ok(asks.length >= 2, `asks: ${asks.length}`);
  assert.deepEqual(C.joins, A.joins, 'C holds A’s layout');
});

test('a lost answer to a layout ask is asked for again', async () => {
  const { A, C } = await lateOldLayout();
  let lost = 0;
  bus.drop = (event, p) => event === 'layout' && p.from === 'A' && lost++ === 0;   // A's first answer is lost
  hear('C');
  await tick(6000);
  assert.equal(lost >= 2, true, 'A answered again');
  assert.deepEqual(C.joins, A.joins, 'C holds A’s layout');
});

test('C stops asking once the layout arrives', async () => {
  const { A, C } = await lateOldLayout();
  const answered = asksFrom('C');
  bus.drop = (event, p) => { answered.count(event, p); return false; };
  hear('C');
  await tick(20000);
  assert.deepEqual(C.joins, A.joins);
  assert.equal(answered.asks.length, 1, 'answered at once: no more asks');
});

test('when no answer comes, C asks again a capped number of times, then gives up (Rule 3)', async () => {
  const { C: C2 } = await lateOldLayout();
  const ignored = asksFrom('C');
  bus.drop = (event, p) => ignored.count(event, p);   // every ask is lost
  hear('C');
  await tick(30000);
  const n = ignored.asks.length;
  assert.ok(n >= 3 && n <= 6, `asks: ${n}`);
  for (let i = 1; i < n; i++) assert.ok(ignored.asks[i] - ignored.asks[i - 1] >= 1000, 'asks are at least LAYOUT_GAP apart');
  await tick(30000);
  assert.equal(ignored.asks.length, n, 'no asks after giving up');
  assert.equal(C2.leader, 'A');
});

test('only the time keeper answers a layout ask, and a malformed ask is dropped (Rule 1)', async () => {
  await room();
  const sent = [];
  bus.drop = (event, p) => { if (event === 'layout') sent.push(p.from); return false; };
  for (const bad of [null, {}, { from: 'C' }, { from: 'C', to: 7 }, { from: 'x'.repeat(41), to: 'L' }, { from: 'nobody', to: 'L' }])
    deliver('L', 'layoutask', bad);
  deliver('A', 'layoutask', { from: 'C', to: 'A' });   // A isn't the time keeper
  deliver('A', 'layoutask', { from: 'C', to: 'L' });   // not addressed to A
  await tick(3000);
  assert.deepEqual(sent, [], 'nobody answered');
  deliver('L', 'layoutask', { from: 'C', to: 'L' });
  await tick(100);
  assert.deepEqual(sent, ['L'], 'the time keeper answered a well-formed ask');
});

test('a flood of layout asks gets at most one answer per gap, and the last ask is still answered (Rule 3)', async () => {
  await room();
  const sent = [];
  bus.drop = (event, p) => { if (event === 'layout') sent.push(Date.now()); return false; };
  let last = 0;
  for (let i = 0; i < 200; i++) { last = Date.now(); deliver('L', 'layoutask', { from: 'C', to: 'L' }); await tick(10); }   // 2 s of asks
  await tick(2000);
  assert.ok(sent.length >= 2 && sent.length <= 4, `answers: ${sent.length}`);
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i] - sent[i - 1] >= 1000, 'answers are at least 1 s apart');
  assert.ok(sent[sent.length - 1] >= last, 'an answer went out after the last ask');
});

// #96: the join results (joined, retry, nomatch) the new time keeper sends before a device hears
// it took over are kept too, and shown once the device hears, instead of its own "No match"
async function lateHearer() {
  const devs = await room();
  leaves(devs, 'L');
  hear('A');                       // A hears first and takes over. B and C still count L
  await tick(100);
  return devs;
}
// X arrives claiming to have been in the room first, so it becomes B's time keeper
function earliestArrival() {
  const X = joinRoom({ room: 'r', id: 'X', name: 'x', size: { w: 400, h: 800 } });
  presence.X = { ...presence.X, joinedAt: 0 };
  hear('B');
  return X;
}

test('a device that hears late still shows the new time keeper’s "Joined", not its own timeout (#96)', async () => {
  const { A, B } = await lateHearer();
  A.push('R', 400); B.push('L', 400);
  await tick(1500);
  assert.deepEqual(names(B), [], 'A’s joined reached B while B still counted L');
  hear('B');
  await tick(6000);
  assert.equal(B.leader, 'A');
  assert.deepEqual(names(B), ['joined A-B'], names(B).join('; '));
  assert.equal(B.heard[0].d.latest, true, 'it answers B’s latest push');
  assert.deepEqual(ownNoMatch(B), [], 'B’s own timeout was stopped');
});

test('a late device still shows the new time keeper’s "Try again" and "No match", in either order (#96)', async () => {
  const { A, B, C } = await lateHearer();
  A.push('R', 400); B.push('L', 400); C.push('L', 400);   // one push from A, two phones on its right: retry
  await tick(1500);
  B.push('T', 100);                                         // a lone push: nomatch
  await tick(3000);
  hear('C', 'B');                  // in the opposite order to the one they arrived in
  await tick(6000);
  assert.deepEqual(names(B), ['retry A,B,C', 'nomatch B'], names(B).join('; '));
  assert.deepEqual(B.heard.map(({ d }) => [d.latest, !!d.timedOut]), [[false, false], [true, false]], 'the nomatch is A’s, not B’s own');
  assert.deepEqual(names(C), ['retry A,B,C', 'nomatch B'], names(C).join('; '));
  assert.deepEqual([ownNoMatch(B), ownNoMatch(C)], [[], []]);
});

test('results from a device that isn’t the time keeper, and stays not, are still dropped (#96, Rule 1)', async () => {
  const devs = await room(), { A, C } = devs;
  const fromB = channels.find((c) => c.key === 'B');
  fromB.send({ event: 'joined', payload: { ...joinedAB(1, 2), from: 'B' } });
  fromB.send({ event: 'nomatch', payload: { dev: 'C', t: 2, from: 'B' } });
  await tick(500);
  leaves(devs, 'L');
  hear('A', 'C');                  // A takes over, not B
  await tick(6000);
  assert.deepEqual([A.leader, C.leader], ['A', 'A']);
  assert.deepEqual([names(A), names(C)], [[], []], 'B’s results were never used');
});

test('a kept joined is checked again when its sender takes over (#96)', async () => {
  const devs = await room(), { B } = devs;
  // A sends a joined naming C while L is the time keeper. Then L and C leave together
  channels.find((c) => c.key === 'A').send({ event: 'joined', payload: { a: 'B', edgeA: 'R', alongA: 1, tA: 1, b: 'C', edgeB: 'L', alongB: 1, tB: 2, from: 'A' } });
  await tick(500);
  leaves(devs, 'L', 'C');
  hear('B');
  await tick(100);
  assert.equal(B.leader, 'A');
  assert.deepEqual(names(B), [], 'A’s kept joined names C, which has left, so it is dropped');
});

test('a kept retry or nomatch naming a device that has left is dropped, and doesn’t stop this device’s wait (#96, Qodo)', async () => {
  const devs = await room(), { B } = devs;
  bus.drop = (event, p) => event === 'push' && p.dev === 'B';   // L never answers B's push
  B.push('L', 400);
  // A sends results naming C while L is the time keeper. Then L and C leave together
  const fromA = channels.find((c) => c.key === 'A');
  fromA.send({ event: 'retry', payload: { devs: ['B', 'C'], pushes: [{ dev: 'B', t: B.times[0] }, { dev: 'C', t: 1 }], from: 'A' } });
  fromA.send({ event: 'nomatch', payload: { dev: 'C', t: 1, from: 'A' } });
  await tick(500);
  leaves(devs, 'L', 'C');
  hear('B');
  await tick(6000);
  assert.equal(B.leader, 'A');
  assert.deepEqual(names(B), ['nomatch B'], names(B).join('; '));
  assert.equal(ownNoMatch(B).length, 1, 'B’s push ended in its own timeout, not in a result naming C');
});

test('a result from a device not in the room is never kept (#96, Rule 1)', async () => {
  const { B } = await room();
  channels.find((c) => c.key === 'A').send({ event: 'nomatch', payload: { dev: 'B', t: 2, from: 'X' } });
  await tick(500);
  const X = earliestArrival();
  await tick(100);
  assert.equal(B.leader, 'X');
  assert.deepEqual(names(B), [], 'what came from X before it was in the room was not kept');
  X.leave();
});

test('kept results are capped per device, and the newest are kept (#96, Rule 3)', async () => {
  const devs = await room(), { B } = devs;
  const fromA = channels.find((c) => c.key === 'A');
  for (let i = 1; i <= 100; i++) fromA.send({ event: 'nomatch', payload: { dev: 'C', t: i, from: 'A' } });
  await tick(500);
  leaves(devs, 'L');
  hear('B');
  await tick(100);
  assert.equal(B.leader, 'A');
  const n = names(B).length;
  assert.ok(n >= 1 && n <= 16, `replayed: ${n}`);
  assert.equal(B.heard[n - 1].d.t, 100, 'the newest are kept');
});

// Test gaps from the blind review of #95: each of these fails with #95's fix removed
test('a layout kept from the next time keeper is used when it still holds (#95)', async () => {
  const devs = await room(), { B } = devs;
  const joins = [{ a: 'A', edgeA: 'R', alongA: 1, b: 'B', edgeB: 'L', alongB: 1 }];
  channels.find((c) => c.key === 'A').send({ event: 'layout', payload: { from: 'A', joins } });
  await tick(500);
  leaves(devs, 'L');
  hear('B');
  await settle();
  assert.equal(B.leader, 'A');
  assert.deepEqual(B.joins, joins, 'B used A’s kept layout at once');
});

test('a layout from a device not in the room is never kept (#95, Rule 1)', async () => {
  const { B } = await room();
  channels.find((c) => c.key === 'A').send({ event: 'layout', payload: { from: 'X', joins: [{ a: 'A', edgeA: 'R', alongA: 1, b: 'B', edgeB: 'L', alongB: 1 }] } });
  await tick(500);
  const X = earliestArrival();
  await settle();
  assert.equal(B.leader, 'X');
  assert.deepEqual(B.joins, [], 'what came from X before it was in the room was not used');
  X.leave();
});

test('when no usable layout was kept, the device asks the new time keeper for it (#95)', async () => {
  const devs = await room(), { C } = devs;
  const asks = [];
  bus.drop = (event, p) => { if (event === 'layoutask') asks.push([p.from, p.to]); return false; };
  leaves(devs, 'L', 'A');
  hear('C');
  await tick(100);
  assert.equal(C.leader, 'B');
  assert.deepEqual(asks[0], ['C', 'B'], 'C asked B');
});

// The new time keeper leaves straight away, and B and C hear it in either order
async function newKeeperLeaves(first, second) {
  const devs = await lateHearer(), { A, B, C } = devs;
  hear('B', 'C');
  A.push('R', 400); B.push('L', 400);
  await tick(3000);
  C.push('L', 400); B.push('R', 400);
  await tick(3000);
  assert.equal(A.joins.length, 2, 'A joined A-B and B-C');
  leaves(devs, 'A');
  hear(first);
  await tick(1000);
  hear(second);
  await tick(3000);
  assert.deepEqual([B.leader, C.leader], ['B', 'B']);
  assert.deepEqual(C.joins, B.joins, 'C holds B’s layout');
  assert.deepEqual(B.joins.map((j) => [j.a, j.b].sort().join()), ['B,C'], 'only B-C is left, nothing names A');
}
test('the new time keeper leaves straight away: B hears first, takes over and C agrees', () => newKeeperLeaves('B', 'C'));
test('the new time keeper leaves straight away: C hears first and still ends with B’s layout', () => newKeeperLeaves('C', 'B'));
