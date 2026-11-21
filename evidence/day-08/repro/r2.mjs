import { setup, room, tick, names, ownNoMatch, bus } from './harness.mjs';
setup();
const { L, A } = await room();
const log = [], t0 = Date.now();
A.on((ev, d) => { if (ev === 'pushed') log.push(`pushed ${d.edge}@${Date.now() - t0}`); });
bus.drop = (ev, p) => ev === 'push' && p.dev === 'A' && p.edge === 'T';   // 2nd push lost
// t0 is set above, before the first push
A.push('L', 400);
const nomSentAt = [];
await tick(2000);
A.push('T', 100);                      // tap again at 2.0 s, still waiting for push 1's answer
console.log('2nd push at', Date.now() - t0, 'ms');
await tick(20000);
console.log('A heard:', A.heard.map((h) => `${h.ev}${h.d.timedOut ? '(own timer)' : ' from ' + h.d.from}@${h.at}`), '; own No match for 2nd push:', ownNoMatch(A).length);
process.exit(0);
