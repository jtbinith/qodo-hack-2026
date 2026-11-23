// Repro: a late device that passes through an intermediate time keeper on its way to the real
// one loses the real one's kept join results, so it shows its own "No match" for a join that worked.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const LAG = 100;
let channels = [], presence = {};
const bus = { drop: null };
class FakeChannel {
  handlers = {};
  on(type, filter, h) { this.handlers[type + ':' + filter.event] = h; return this; }
  send({ event, payload }) {
    if (bus.drop?.(event, payload)) return;
    const copy = JSON.parse(JSON.stringify(payload));
    for (const c of channels) if (c !== this) setTimeout(() => c.handlers['broadcast:' + event]?.({ payload: copy }), LAG);
  }
  presenceState() { return Object.fromEntries(Object.entries(presence).map(([k, m]) => [k, [m]])); }
  async track(m) { presence[this.key] = m; for (const c of channels) c.handlers['presence:sync']?.(); }
  subscribe(cb) { cb('SUBSCRIBED'); }
}
globalThis.window = { supabase: { createClient: () => ({
  channel: (name, { config }) => { const c = new FakeChannel(); c.key = config.presence.key; channels.push(c); return c; },
  removeChannel() {},
}) } };
const realPerformance = globalThis.performance;
const { joinRoom } = await import('../../web/net.js');

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 });
  globalThis.performance = { timeOrigin: 0, now: () => Date.now() };
  channels = []; presence = {}; bus.drop = null;
});
afterEach(() => { mock.timers.reset(); globalThis.performance = realPerformance; });
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
const tick = async (ms) => { for (let k = 0; k < ms; k += 50) { mock.timers.tick(Math.min(50, ms - k)); await settle(); } };

async function room() {
  const devs = {};
  for (const [id, w, h] of [['L', 1440, 900], ['A', 400, 800], ['B', 400, 800], ['C', 400, 800]]) {
    const s = joinRoom({ room: 'r', id, name: id.toLowerCase(), size: { w, h } });
    s.heard = [];
    s.on((ev, d) => { if (['joined', 'retry', 'nomatch'].includes(ev)) s.heard.push({ ev, d }); });
    devs[id] = s;
    await tick(1);
  }
  await settle();
  return devs;
}
const names = (s) => s.heard.map(({ ev, d }) => ev + ' ' + (d.dev || d.devs?.join(',') || d.a + '-' + d.b) + (d.timedOut ? ' (own timeout)' : ''));
const hear = (id) => channels.find((c) => c.key === id).handlers['presence:sync']();

test('a late device that hears L leave before A still shows B’s "Joined" (#96)', async () => {
  const devs = await room(), { B, C } = devs;
  const presA = presence.A;
  for (const k of ['L', 'A']) { delete presence[k]; devs[k].leave(); channels = channels.filter((c) => c.key !== k); }
  hear('B');                                   // B hears both leave and takes over
  await tick(100);
  assert.equal(B.leader, 'B');
  B.push('R', 400); C.push('L', 400);          // C still counts L as time keeper
  await tick(1500);
  assert.deepEqual(names(C), [], 'B’s joined reached C while C still counted L: kept');
  presence.A = presA; hear('C');               // C hears L leave first: A looks like the time keeper
  assert.equal(C.leader, 'A');
  delete presence.A; hear('C');                // then A leave: B is the time keeper
  assert.equal(C.leader, 'B');
  await tick(6000);
  assert.deepEqual(names(C), ['joined B-C'], names(C).join('; '));
});
