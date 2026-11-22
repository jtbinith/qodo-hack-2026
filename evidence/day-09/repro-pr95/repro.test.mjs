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
const { joinRoom } = await import('../../../web/net.js');

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

// The time keeper leaves and the others hear it at different times (C5, #61). `leaves` takes
// devices out of the room without telling anyone. `hear` tells the devices it names
function leaves(devs, ...gone) {
  for (const id of gone) { delete presence[id]; devs[id].leave(); channels = channels.filter((c) => c.key !== id); }
}
const hear = (...ids) => { for (const id of ids) channels.find((c) => c.key === id).handlers['presence:sync'](); };

test('REPRO: device that hears late misses its own Joined result', async () => {
  const devs = await room(), { A, B } = devs;
  leaves(devs, 'L');
  hear('A');
  await tick(100);
  A.push('R', 400); B.push('L', 400);
  await tick(1500);
  hear('B');            // B hears 1.5 s later; A's 'joined' has already been dropped
  await tick(6000);
  console.log('B leader', B.leader, 'B joins', B.joins.length, 'B heard:', names(B).join('; '), '| own timeout nomatch:', ownNoMatch(B).length);
});
