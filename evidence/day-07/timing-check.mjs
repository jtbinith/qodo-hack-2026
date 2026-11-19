// Day 7, finding 2: when does `joined` fire for a second tap at 1.9 s?
// Runs the real web/net.js (onPush, resolve, WINDOW, DEADLINE) and the real matchPushes from
// web/layout.js on the time keeper, with a fake Supabase channel. Network delay is left out, so
// the times are the time keeper's own decisions.
// Run: node evidence/day-07/timing-check.mjs
import { performance } from 'node:perf_hooks';

function fakeSupabase() {
  const handlers = {}, sent = [];
  const ch = {
    on(type, filter, cb) { handlers[`${type}:${filter.event}`] = cb; return ch; },
    send(msg) { sent.push(msg); return Promise.resolve('ok'); },
    subscribe(cb) { queueMicrotask(() => cb('SUBSCRIBED')); return ch; },
    track() { return Promise.resolve('ok'); },
    presenceState: () => ({
      A: [{ name: 'A', w: 800, h: 600, joinedAt: 1 }],    // earliest: A is the time keeper
      B: [{ name: 'B', w: 400, h: 800, joinedAt: 2 }],
    }),
  };
  return { client: { channel: () => ch, removeChannel() {} }, handlers, sent };
}

async function run(label, secondTapAt) {
  const fake = fakeSupabase();
  globalThis.window = { supabase: { createClient: () => fake.client } };
  const { joinRoom } = await import(`../../web/net.js?${label}`);
  const s = joinRoom({ room: 'T', id: 'A', name: 'A', size: { w: 800, h: 600 } });
  await new Promise((r) => setTimeout(r, 10));
  fake.handlers['presence:sync']();                       // both devices are here; A leads
  const t0 = performance.now(), at = () => ((performance.now() - t0) / 1000).toFixed(2) + ' s';
  const log = [];
  s.on((ev, d) => { if (['joined', 'nomatch', 'retry'].includes(ev)) log.push(`${at()}  ${ev} ${JSON.stringify(d)}`); });
  log.push(`${at()}  A taps its right strip (the time keeper's own tap)`);
  s.push('R', 300);
  if (secondTapAt != null) setTimeout(() => {
    log.push(`${at()}  B's tap on its left strip reaches the time keeper`);
    fake.handlers['broadcast:push']({ payload: { dev: 'B', edge: 'L', along: 300, t: s.now() } });
  }, secondTapAt);
  setTimeout(() => log.push(`${at()}  (a 2 s timer started by A's own tap would fire here)`), 2000);
  await new Promise((r) => setTimeout(r, 4000));
  s.leave();
  console.log(`\n== ${label}\n` + log.join('\n'));
}

console.log(`node ${process.version}, web/net.js and web/layout.js from this checkout`);
await run('second tap at 1.9 s', 1900);
await run('second tap at 0.5 s', 500);
await run('second tap at 1.99 s (latest that can pair)', 1990);
await run('lone tap', null);
