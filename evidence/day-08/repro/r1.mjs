// R1: a result for this device's EARLIER push cancels the wait for its LATER push
import { setup, room, tick, names, ownNoMatch, bus } from './harness.mjs';
setup();
{
  const { L, A } = await room();
  // A's second push (edge T) is dropped silently by the network / a full batch
  bus.drop = (ev, p) => ev === 'push' && p.dev === 'A' && p.edge === 'T';
  A.push('L', 400); L.push('R', 450);      // pair -> joined A-L
  await tick(300);
  A.push('T', 100);                        // second tap, gets no reply
  await tick(20000);
  console.log('R1 A heard:', names(A), 'own nomatch count:', ownNoMatch(A).length);
}
setup();
{
  // R2: a stale nomatch for the previous lone push cancels the wait for the next push
  const { L, A } = await room();
  A.push('L', 400);                        // lone push, leader will nomatch it ~2.x s
  let n = 0;
  bus.drop = (ev, p) => ev === 'push' && p.dev === 'A' && ++n >= 1 && p.edge === 'T';
  const nomAt = () => A.heard.find((h) => h.ev === 'nomatch')?.at;
  // push again just before the leader's nomatch for push 1 arrives
  for (let t = 0; t < 4000 && !nomAt(); t += 50) { await tick(50); if (!A._p2 && t >= 2300) { A._p2 = true; A.push('T', 100); } }
  await tick(20000);
  console.log('R2 A heard:', A.heard.map((h) => `${h.ev}${h.d.timedOut ? '(own)' : ''}@${h.at}`), 'own nomatch for 2nd push:', ownNoMatch(A).length);
}
process.exit(0);
