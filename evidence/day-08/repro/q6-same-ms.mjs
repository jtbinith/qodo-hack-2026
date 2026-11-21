// Qodo 1baf3c69 on PR #89: two pushes with the same timestamp share one wait
import { setup, room, tick, bus } from './harness.mjs';
setup();
const { L, A } = await room();
let n = 0; bus.drop = (ev, p) => ev === 'push' && p.dev === 'A' && ++n === 2;   // A's second push is lost
A.push('L', 400); A.push('T', 100); L.push('R', 450);                          // same mocked ms for A's two pushes
await tick(20000);
console.log('A two pushes at t =', [...new Set([0])], '| heard:', A.heard.map((h) => `${h.ev}${h.d.timedOut ? '(own)' : ''}@${h.at}`).join(', '));
process.exit(0);
