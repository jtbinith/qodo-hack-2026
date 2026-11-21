// Qodo 07c384af: the time keeper decides A-B, then leaves before its messages arrive
import { setup, room, tick, bus, channels, presence } from './harness.mjs';
setup();
const { L, A, B } = await room();
bus.drop = (ev) => { if (ev === 'joined') setTimeout(() => {   // L leaves 10 ms after sending
  delete presence.L; channels.splice(channels.findIndex((c) => c.key === 'L'), 1);
  for (const c of channels) c.handlers['presence:sync']?.(); }, 10); return false; };
A.push('R', 400); B.push('L', 400);
await tick(8000);
for (const [n, s] of [['A', A], ['B', B]]) console.log(n, 'leader', s.leader, '| joins in layout', JSON.stringify(s.joins.map((j) => j.a + '-' + j.b)), '| heard', s.heard.map((h) => `${h.ev}${h.d.timedOut ? '(own)' : ''}@${h.at}`).join(', '));
process.exit(0);
