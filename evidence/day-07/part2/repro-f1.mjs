// Finding cbfbb88c (Recovered transfers still fail): the real askLimiter and askKind from #87's
// web/check.js, driven by the receiver's retry loop as written in web/index.html:229-240 and
// dropped() at :255-264 (8ddeaf8). The link is modelled: until `recoverAt` the holder can't send
// (a relay send waits for the receiver's key and gives up after SEND_TIMEOUT, peers.js:18,150-160);
// a send started after recovery delivers the photo. Message delay is DELAY each way.
// Run: node repro-f1.mjs <path to the #87 worktree>
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { askLimiter, askKind } = await import(pathToFileURL(join(process.argv[2], 'web/check.js')).href);

const SEND_TIMEOUT = 10000, SIZE = 5 * 1024 * 1024;
let DELAY = 100, WANT_DELAY = 100;
function run(recoverAt, limited) {
  let t = 0;
  const lim = askLimiter(() => t);
  const inc = { last: 0, asks: 0 };   // expect() at t = 0 (index.html:161-165)
  const asks = [];                     // [time the holder sees it, message]
  asks.push([WANT_DELAY, { t: 'want', pid: 'p' }]);   // dropped(): the first ask (:261)
  let refused = 0, allowedFails = 0;
  for (t = 0; t <= 120000; t += 100) {
    // holder side: handle asks that have arrived
    for (const a of asks.filter((a) => a[0] === t)) {
      const m = a[1], kind = m.t === 'want' ? 'whole' : askKind(m, SIZE);
      const ok = !limited || (kind && lim.allow('receiver', 'p', kind));
      if (!ok) { refused++; continue; }
      if (t >= recoverAt) return { got: t + DELAY, refused, allowedFails };
      if (t + SEND_TIMEOUT >= recoverAt) return { got: recoverAt + DELAY, refused, allowedFails };  // held frames flush when the key lands
      allowedFails++;                   // timed out: counted, nothing sent
      if (limited && lim.undo) lim.undo('receiver', 'p', kind);   // after the fix: given back (index.html .catch)
    }
    // receiver side: the 1.5 s loop (index.html:231-240), nothing has arrived so missing = null
    if (t % 1500 === 0 && t > 0) {
      if (t - inc.last >= 3000) {
        if (inc.asks >= 20) return { gaveUp: t, refused, allowedFails };
        inc.last = t; inc.asks++;
        asks.push([t + DELAY, { t: 'need', fid: 'p', missing: null }]);
      }
    }
  }
  return { none: true };
}
for ([DELAY, WANT_DELAY] of [[100, 100], [100, 400]]) {
console.log(`\nneed delay ${DELAY} ms, first want delay ${WANT_DELAY} ms`);
console.log('link recovers at | without the limit       | with #87 (8ddeaf8)');
for (const r of [5000, 12000, 20000, 30000, 40000, 50000, 55000]) {
  const a = run(r, false), b = run(r, true);
  const show = (x) => x.got != null ? `photo at ${(x.got / 1000).toFixed(1)} s` : `gave up at ${(x.gaveUp / 1000).toFixed(1)} s`;
  console.log(`${(r / 1000).toString().padStart(5)} s          | ${show(a).padEnd(22)} | ${show(b)}  (asks refused: ${b.refused}, counted sends that failed: ${b.allowedFails})`);
}
}
