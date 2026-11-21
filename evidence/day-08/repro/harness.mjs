// Unit tests for join results in web/net.js (C15, #68): results count only from the time
// keeper, and a device that pushed gives up by itself when no result names it.
// Several real joinRoom devices share a fake room server, and the clock is mocked so
// seconds pass instantly. The room server takes LAG ms to pass each message on.
import { mock } from 'node:test';
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
const { joinRoom } = await import('<checkout>/web/net.js');


const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
const tick = async (ms) => { for (let k = 0; k < ms; k += 50) { mock.timers.tick(Math.min(50, ms - k)); await settle(); } };

// L arrives first, so it is the time keeper. A, B and C are phones
let start = 0;
async function room() {
  const devs = {};
  for (const [id, w, h] of [['L', 1440, 900], ['A', 400, 800], ['B', 400, 800], ['C', 400, 800]]) {
    const s = joinRoom({ room: 'r', id, name: id.toLowerCase(), size: { w, h } });
    s.heard = [];
    s.on((ev, d) => { if (['joined', 'retry', 'nomatch'].includes(ev)) s.heard.push({ ev, d, at: Date.now() - start }); });
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
export { room, tick, names, ownNoMatch, bus, channels, presence };
export function setup() {
  mock.timers.reset();
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 });
  globalThis.performance = { timeOrigin: 0, now: () => Date.now() };
  channels.length = 0; for (const k of Object.keys(presence)) delete presence[k]; bus.drop = null;
}
