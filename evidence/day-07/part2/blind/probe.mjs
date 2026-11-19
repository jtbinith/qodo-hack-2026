// hashwasm global not needed for these functions
import { askKind, askLimiter, LIMITS, pieceCount } from '/tmp/blind20/check.js';
const clock = () => { let t = 0; const now = () => t; now.at = (ms) => { t = ms; }; return now; };
const out = (...a) => console.log(...a);

// 1. alternating halves: whole file every 2 s via 'pieces'
{
  const now = clock(), lim = askLimiter(now);
  const cs = 65536, size = 10 * 1024 * 1024, n = pieceCount(size, cs); // 160 pieces
  const A = [...Array(n / 2).keys()], B = A.map((i) => i + n / 2);
  let piecesSent = 0;
  for (let t = 0; t < 60000; t += 1000) {
    now.at(t);
    const m = { t: 'need', fid: 'p', missing: (t / 1000) % 2 ? B : A, cs };
    const k = askKind(m, size);
    if (k && lim.allow('evil', 'p', k)) piecesSent += m.missing.length;
  }
  out('1 halves: kind', askKind({ t: 'need', missing: A, cs }, size), 'whole-file equivalents in 60 s =', piecesSent / n);
}
// 2. 300-piece lists on a 200 MB file
{
  const now = clock(), lim = askLimiter(now);
  const cs = 65536, size = LIMITS.fileBytes, n = pieceCount(size, cs);
  let sent = 0;
  for (let t = 0; t < 60000; t += 1000) {
    now.at(t);
    const start = ((t / 1000) * 300) % n;
    const missing = [...Array(300).keys()].map((i) => (start + i) % n);
    const m = { t: 'need', fid: 'p', missing: [...new Set(missing)], cs };
    const k = askKind(m, size); if (k && lim.allow('evil', 'p', k)) sent += m.missing.length;
  }
  out('2 big file: n =', n, 'kind of 300-list =', askKind({ t: 'need', missing: [...Array(300).keys()], cs }, size), 'MB sent in 60 s =', (sent * cs / 2 ** 20) | 0, 'vs whole limit MB', 3 * size / 2 ** 20);
}
// 3. table fill DoS: 20 ids x 100 files, honest device refused
{
  const now = clock(), lim = askLimiter(now);
  for (let d = 0; d < LIMITS.askRecords / LIMITS.askRecordsPerDevice; d++)
    for (let f = 0; f < LIMITS.askRecordsPerDevice; f++) lim.allow('evil' + d, 'f' + f, 'whole');
  now.at(30000);
  out('3 table full:', lim.size, 'honest want allowed?', lim.allow('honest', 'f0', 'whole'));
  // keep alive: evil re-asks once per ~59 s (2nd of 3 allowed) to stay live
  now.at(59000); for (let d = 0; d < 20; d++) for (let f = 0; f < 100; f++) lim.allow('evil' + d, 'f' + f, 'whole');
  now.at(61000); out('3 after keepalive at 61 s, honest allowed?', lim.allow('honest', 'f0', 'whole'));
}
// 4. leave/rejoin resets
{
  const now = clock(), lim = askLimiter(now); let n = 0;
  for (let cyc = 0; cyc < 10; cyc++) { for (let k = 0; k < 5; k++) if (lim.allow('evil', 'p', 'whole')) n++; lim.forget('evil'); now.at(now() + 2000); }
  out('4 leave/rejoin 10 times in 20 s: whole sends allowed =', n);
}
// 5. undo after forget+recreate refunds the new record
{
  const now = clock(), lim = askLimiter(now);
  for (let k = 0; k < 3; k++) lim.allow('evil', 'p', 'whole');   // 3 old sends in flight (stalled, will fail sent=0)
  lim.forget('evil');                                             // leaves
  let n = 0; for (let k = 0; k < 3; k++) if (lim.allow('evil', 'p', 'whole')) n++;   // rejoins: 3 real sends
  for (let k = 0; k < 3; k++) lim.undo('evil', 'p', 'whole');    // old ones fail with sent 0
  for (let k = 0; k < 5; k++) if (lim.allow('evil', 'p', 'whole')) n++;
  out('5 real sends after old undos land on new record =', n, '(limit 3)');
}
// 5b. undo pops newest stamp, not the failed send's
{
  const now = clock(), lim = askLimiter(now);
  lim.allow('b', 'p', 'whole');            // A at 0 (moves data)
  now.at(50000); lim.allow('b', 'p', 'whole'); // B at 50 s (fails sent 0)
  now.at(55000); lim.allow('b', 'p', 'whole'); // C at 55 s (moves data)
  lim.undo('b', 'p', 'whole');             // B fails -> pops C's stamp
  now.at(60000);
  let n = 0; for (let k = 0; k < 5; k++) if (lim.allow('b', 'p', 'whole')) n++;
  out('5b at 60 s allowed', n, '(correct would be 1: only A expired, C still in window; B refunded -> 2 slots used by B? correct=2)');
}
// 6. honest receiver: nothing/over-half arriving, retries 3 s apart are 'whole'
{
  const now = clock(), lim = askLimiter(now);
  const res = [];
  lim.allow('r', 'p', 'whole'); // the want
  for (let t = 3000; t <= 63000; t += 3000) { now.at(t); res.push(lim.allow('r', 'p', 'whole') ? 'Y' : '.'); }
  out('6 honest whole retries at 3..63 s:', res.join(''));
}
// 7. perDev invariant fuzz
{
  const now = clock(), lim = askLimiter(now); let t = 0, bad = 0;
  for (let k = 0; k < 200000; k++) {
    t += Math.random() * 50; now.at(t);
    const d = 'd' + ((Math.random() * 40) | 0), f = 'f' + ((Math.random() * 150) | 0);
    const r = Math.random();
    if (r < 0.01) lim.forget(d); else if (r < 0.05) lim.undo(d, f, Math.random() < .5 ? 'whole' : 'pieces'); else lim.allow(d, f, Math.random() < .5 ? 'whole' : 'pieces');
    if (lim.size > LIMITS.askRecords) bad++;
  }
  out('7 fuzz size violations', bad, 'final size', lim.size);
}
// 8. sweep cost when full: time 10000 refused asks
{
  const now = clock(), lim = askLimiter(now);
  for (let d = 0; d < 20; d++) for (let f = 0; f < 100; f++) lim.allow('evil' + d, 'f' + f, 'whole');
  const t0 = performance.now(); for (let k = 0; k < 10000; k++) lim.allow('evil0', 'g' + k, 'whole');
  out('8 10000 refused new-file asks took ms', (performance.now() - t0) | 0);
}
// 9. empty list / size 0
out('9 empty list kind', askKind({ t: 'need', missing: [], cs: 65536 }, 1000));
