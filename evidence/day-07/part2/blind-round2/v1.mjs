import { askLimiter, askBytes, LIMITS } from '/tmp/blind20b/check.js';
const clock = () => { let t = 0; const n = () => t; n.at = (m) => { t = m; }; return n; };
// 1. refund-after-dropped-frames: sendFile resolves {sent:0,of:n} -> full refund -> unlimited asks
{ const now = clock(), lim = askLimiter(now); let ok = 0;
  for (let k = 0; k < 1000; k++) { const tok = lim.allow('b', 'f', 200e6, 200e6, false); if (tok) { ok++; lim.undo(tok, 1); } }
  console.log('1. whole asks allowed with full refunds each time (same ms):', ok); }
// 2. zero-size file: bytes 0, budget 0 -> unlimited; sends array grows
{ const now = clock(), lim = askLimiter(now); let ok = 0;
  for (let k = 0; k < 20000; k++) if (lim.allow('b', 'z', askBytes({ t: 'want', pid: 'p' }, 0), 0, false)) ok++;
  const t0 = performance.now(); for (let k = 0; k < 2000; k++) lim.allow('b', 'z', 0, 0, false);
  console.log('2. zero-size file whole asks allowed:', ok, ' 2000 more took', (performance.now() - t0) | 0, 'ms'); }
// 3. empty-list needs create live counters at zero cost; ids that churn fill the table
{ const now = clock(), lim = askLimiter(now);
  const b = askBytes({ t: 'need', fid: 'x', missing: [], cs: 24576 }, 5e6);
  console.log('3. bytes for missing:[] =', b);
  for (let d = 0; d < LIMITS.devices; d++) for (let f = 0; f < LIMITS.askRecordsPerDevice; f++) lim.allow('churn' + d, 'f' + f, b, 5e6, true);
  now.at(30000);
  console.log('   table size', lim.size, ' honest new ask at 30 s:', lim.allow('honest', 'p', 5e6, 5e6, false));
  now.at(59999); console.log('   honest at 59.999 s:', lim.allow('honest', 'p', 5e6, 5e6, false));
  now.at(60000); console.log('   honest at 60 s:', !!lim.allow('honest', 'p', 5e6, 5e6, false)); }
// 4. prototype-key ids pass a plain-object presence check
{ const peers = { a: {}, b: {} };
  console.log('4. ids passing net.peers[from] without presence:', ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'].filter((k) => !!peers[k]).length); }
// 5. sweep gating: a per-device-capped attacker triggers the sweep, then an honest new pair is refused for up to 1s although stale counters exist
{ const now = clock(), lim = askLimiter(now);
  for (let d = 0; d < 19; d++) for (let f = 0; f < 1000; f++) lim.allow('s' + d, 'f' + f, 0, 1, true);   // stale after 60 s
  for (let f = 0; f < 1000; f++) lim.allow('atk', 'f' + f, 0, 1, true);
  now.at(70000);
  lim.allow('atk', 'new', 0, 1, true);  // atk at cap? its counters stale: sweep happens, clears all
  console.log('5. size after sweep', lim.size); }
// 6. float drift from partial refunds
{ const now = clock(), lim = askLimiter(now), size = 7 * 24576; let toks = [];
  for (let k = 0; k < 3; k++) toks.push(lim.allow('b', 'f', size, size, false));
  toks.forEach((t) => lim.undo(t, 2 / 7));
  const sum = 3 * size * (5 / 7);
  const rest = 3 * size - sum; // should fit exactly
  console.log('6. leftover expected', rest, 'allowed exact fill?', !!lim.allow('b', 'f', rest, size, false)); }
