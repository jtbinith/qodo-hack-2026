import { setup, push, advance, sent } from './sim.mjs';
// A taps at 0; partner L taps at tp (<=2000); bystander C taps at c1, c2 (any edge with no partner). Find latest 'joined'.
let worst = { t: 0 };
for (let c0 = 0; c0 <= 2000; c0 += 50) for (let tp = 1500; tp <= 2000; tp += 50) for (let g = 100; g <= 900; g += 100) {
  setup(); const ev = [{ t: 0, p: { dev: 'A', edge: 'L', along: 400 } }, { t: tp, p: { dev: 'L', edge: 'R', along: 450 } }];
  if (c0) ev.push({ t: c0, p: { dev: 'C', edge: 'T', along: 1 } });
  for (let k = 1; k <= 4; k++) ev.push({ t: tp + k * g - 1, p: { dev: 'C', edge: 'T', along: 1 } });
  ev.sort((a, b) => a.t - b.t);
  for (const e of ev) { advance(e.t); push({ ...e.p, t: e.t }); }
  advance(20000);
  const j = sent.find((m) => m.event === 'joined');
  if (j && j.t > worst.t) worst = { t: j.t, c0, tp, g };
}
console.log('latest joined (ms after first tap):', worst);
