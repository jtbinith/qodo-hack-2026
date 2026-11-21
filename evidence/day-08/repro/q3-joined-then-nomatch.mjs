// Qodo c7362445: one device pushes twice, one push pairs -> joined, then nomatch for the other
import { setup, room, tick } from './harness.mjs';
setup();
const { A, B } = await room();
A.push('T', 200);                 // lone push at 0, on another edge
await tick(1900);
A.push('R', 400); B.push('L', 400); // second push pairs with B
await tick(6000);
console.log('A heard, in order:', A.heard.map((h) => `${h.ev}${h.d.timedOut ? '(own)' : ''}@${h.at}`).join(', '));
process.exit(0);
