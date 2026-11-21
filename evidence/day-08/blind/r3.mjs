// R3: device clock ahead of the time keeper's (e.g. before its first pong, offset 0) by SKEW ms
import { setup, room, tick, ownNoMatch } from './harness.mjs';
const SKEW = +process.argv[2];
setup();
const { L, A, B } = await room();
A.now = () => Date.now() + SKEW;          // s.now() is read through s, as net.js does
const t0 = Date.now();
A.push('L', 400);
await tick(6200);
B.push('R', 400);                          // B answers A's edge 6.2 s later
await tick(10000);
console.log(`skew ${SKEW}:`, A.heard.map((h) => `${h.ev}${h.d.timedOut ? '(own timer)' : ''}@${h.at}`));
process.exit(0);
