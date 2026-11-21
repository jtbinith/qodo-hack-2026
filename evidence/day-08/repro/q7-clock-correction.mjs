// Qodo 240d001d (local review of round 3): pushes keep a timestamp from before a clock correction
import { setup, room, tick, bus } from './harness.mjs';
setup();
const { A } = await room();
const sent = []; bus.drop = (ev, p) => { if (ev === 'push' && p.dev === 'A') sent.push(p.t); return false; };
A.offset = 5000; A.push('T', 100);           // clock 5 s ahead before its first clock reply
await tick(1000); A.offset = 0;              // the clock reply corrects it
A.push('T', 100); await tick(1000); A.push('T', 100);
const now = Date.now();
console.log('push t minus true time (ms):', sent.map((t, i) => Math.round(t - (now - (2 - i) * 1000))));
process.exit(0);
