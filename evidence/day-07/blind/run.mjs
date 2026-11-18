import { setup, push, advance, sent } from './sim.mjs';
const show = (label) => console.log(label, sent.filter(m => m.event !== 'layout').map(m => `${m.event}@${m.t} ${JSON.stringify(m.payload)}`));
// 1. lone tap
setup(); push({ dev: 'A', edge: 'L', along: 400, t: 0 }); advance(6000); show('lone tap:');
// 2. second tap 1.9 s later (zero latency)
setup(); push({ dev: 'A', edge: 'L', along: 400, t: 0 }); advance(1900); push({ dev: 'L', edge: 'R', along: 450, t: 1900 }); advance(8000); show('1.9s pair:');
// 3. partner at 1.999 s, then an unrelated device C taps T edge twice -> joined later than 4 s?
setup(); push({ dev: 'A', edge: 'L', along: 400, t: 0 }); advance(1999); push({ dev: 'L', edge: 'R', along: 450, t: 1999 });
advance(2800); push({ dev: 'C', edge: 'T', along: 100, t: 2800 }); advance(3600); push({ dev: 'C', edge: 'T', along: 120, t: 3600 }); advance(9000); show('busy room:');
// 4. lone tap A, C keeps tapping every 800 ms -> when does A get nomatch?
setup(); push({ dev: 'A', edge: 'L', along: 400, t: 0 }); for (let t = 800; t <= 6000; t += 800) { advance(t); push({ dev: 'C', edge: 'T', along: 100, t }); } advance(12000); show('C spamming:');
// 5. one laptop tap, two phones -> retry list
setup(); push({ dev: 'L', edge: 'R', along: 450, t: 0 }); push({ dev: 'A', edge: 'L', along: 400, t: 10 }); push({ dev: 'B', edge: 'L', along: 400, t: 20 }); push({ dev: 'C', edge: 'T', along: 1, t: 30 }); advance(9000); show('one laptop tap + bystander C:');
// 6. laptop taps 3 times (PER_DEV=2): first tap evicted silently
setup(); push({ dev: 'L', edge: 'R', along: 100, t: 0 }); push({ dev: 'L', edge: 'R', along: 300, t: 10 }); push({ dev: 'L', edge: 'L', along: 300, t: 20 }); advance(9000); show('PER_DEV evict:');
// 7. two phones mid-edge, laptop taps 200 and 700 (900 tall laptop, 800 tall phones)
setup(); push({ dev: 'L', edge: 'R', along: 200, t: 0 }); push({ dev: 'A', edge: 'L', along: 400, t: 5 }); push({ dev: 'L', edge: 'R', along: 700, t: 500 }); push({ dev: 'B', edge: 'L', along: 400, t: 505 }); advance(9000); show('stack mid-edge:');
