import { matchPushes } from './src/layout.js';
const sizes = { L: { w: 1440, h: 900 }, A: { w: 800, h: 400 }, B: { w: 800, h: 400 } };
// A is physically at the top, B at the bottom. Laptop taps top point (200) then bottom (650), 300 ms apart;
// but B happens to tap first (t=0) and A later (t=300).
const r = matchPushes([
  { dev: 'L', edge: 'R', along: 200, t: 0 }, { dev: 'B', edge: 'L', along: 200, t: 0 },
  { dev: 'L', edge: 'R', along: 650, t: 300 }, { dev: 'A', edge: 'L', along: 200, t: 300 }], 2000, { sizes, joins: [] });
console.log(r.joins.map(j => `${j.a}@${j.alongA} <-> ${j.b}@${j.alongB}`));
