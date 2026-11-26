// Pure helpers for scripts/group-check.mjs (the group-device-check skill), unit tested in
// tests/group-check.test.mjs. No browser, no network: scenario checks, text comparison, the verdict.

export const SIZES = { phone: [390, 700], tablet: [768, 1000], laptop: [900, 600] };
export const MAX_DEVICES = 20;
// stand-in share sheets: hang-then-* hangs its first call for hangMs, then settles (works or cancels)
export const SHARES = ['fail-once', 'works', 'hang-then-works', 'hang-then-cancel'];
export const EXIT = { pass: 0, fail: 1, stop: 2 };

const DO = new Set(['pick', 'drag', 'wait', 'tap', 'pause']);
const CHECK = new Set(['toast', 'downloads', 'shared']);   // joins are checked by the runner itself (Qodo on #145)

// A scenario says where every expected text came from. Expected text copied from the code proves
// nothing about the ticket, so a scenario must name the ticket section each check is from.
export function scenarioProblems(s) {
  const p = [];
  if (!s || typeof s !== 'object') return ['the scenario is not a JSON object'];
  if (!Number.isInteger(s.ticket)) p.push('"ticket" (the ticket number) is missing');
  if (!Array.isArray(s.devices) || s.devices.length < 2) p.push('"devices" needs at least 2 devices');
  else {
    if (s.devices.length > MAX_DEVICES) p.push(`more than ${MAX_DEVICES} devices`);
    s.devices.forEach((d, i) => { if (!SIZES[d?.size]) p.push(`device ${i}: size must be one of ${Object.keys(SIZES).join(', ')}`); if (d?.share && !SHARES.includes(d.share)) p.push(`device ${i}: share must be one of ${SHARES.join(', ')}`); if (/^hang-then-/.test(d?.share || '') && !(Number.isInteger(d.hangMs) && d.hangMs > 0 && d.hangMs <= 180000)) p.push(`device ${i}: a hanging share sheet needs "hangMs" (1 to 180000): how long its first call hangs before it settles`); });
  }
  if (!Array.isArray(s.steps) || !s.steps.length) p.push('"steps" is empty');
  else s.steps.forEach((st, i) => {
    const kind = st?.do || st?.check;
    if (st?.do && !DO.has(st.do)) p.push(`step ${i}: unknown action "${st.do}"`);
    if (st?.check && !CHECK.has(st.check)) p.push(`step ${i}: unknown check "${st.check}"`);
    if (!kind) p.push(`step ${i}: needs "do" or "check"`);
    if (st?.check && typeof st.source !== 'string') p.push(`step ${i}: a check needs "source": the ticket section its expected value is copied from`);
    if (st?.check === 'shared' && !Number.isInteger(st.calls)) p.push(`step ${i}: a shared check needs "calls"`);
    if (st?.check === 'toast' && typeof st.equals !== 'string') p.push(`step ${i}: a toast check needs "equals": the exact text from the ticket (an empty toast must never pass)`);   // Qodo on #148
    if (st?.check && typeof st.source === 'string' && /\b(web|src|tests?)\/|\.m?js\b|\.html\b/.test(st.source)) p.push(`step ${i}: "source" points at code (${st.source}); expected text must come from the ticket`);
  });
  return p;
}

// Expected text is compared exactly, after trimming. "N" in a ticket's example ("Downloading 10")
// becomes a number the scenario fills in, so the scenario holds the exact string to expect.
// Curly and straight quotes count as the same character (a ticket typed in Markdown has ' where the
// app shows ’); everything else, spaces inside the text and the middle dot included, must match.
export const plainQuotes = (t) => String(t ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
export const sameText = (expected, actual) => plainQuotes(expected) === plainQuotes(actual);

// The run's verdict from its check points: any check that couldn't run (a stop) wins over a fail,
// a fail wins over a pass, and no check points at all is a stop (nothing was checked).
export function verdict(points) {
  if (!points.length) return { state: 'stop', why: 'no check point ran' };
  const stop = points.find((p) => p.state === 'stop');
  if (stop) return { state: 'stop', why: stop.why };
  const failed = points.filter((p) => p.state === 'fail');
  if (failed.length) return { state: 'fail', why: failed.map((p) => `step ${p.step} (${p.check}): expected ${JSON.stringify(p.expected)}, got ${JSON.stringify(p.actual)}`).join('; ') };
  return { state: 'pass', why: `${points.length} check points passed` };
}

// The room's joins are shared: every device must list n - 1 joins in all and see every other
// device, and its own share of the chain (2 in the middle, 1 at the ends). Anything less means a
// device isn't in the room or isn't joined: stop, never a pass.
export function joinProblems(seen) {
  const n = seen.length, p = [];
  seen.forEach((d, i) => {
    const mine = n === 1 ? 0 : (i === 0 || i === n - 1 ? 1 : 2);
    if (d.devices !== n) p.push(`device ${i} sees ${d.devices} devices, expected ${n}`);
    if (d.joinsTotal !== n - 1) p.push(`device ${i} lists ${d.joinsTotal} joins, expected ${n - 1}`);
    if (d.joinsMine !== mine) p.push(`device ${i} is in ${d.joinsMine} joins, expected ${mine}`);
  });
  return p;
}

// The server serves a file only if its real path (symlinks followed) is inside web/: a build under
// test can't read the reviewer's files through a symlink (Qodo on #145). Both paths already real.
export const insideRoot = (rootReal, fileReal) => fileReal.startsWith(rootReal.endsWith('/') ? rootReal : rootReal + '/');

// A shared check's bytes: every file handed to the share sheet must have been hashed, and each hash
// must match what the sender holds. No hash (not finished, or hashing failed) is a problem, never a
// match (Qodo on #145).
export function sharedBytesProblems(names, hashes, sent) {
  // one by one, in the order they were handed over, so two files with the same name are each
  // checked (Qodo on #145)
  return names.flatMap((n, i) => { const [name, h] = hashes[i] || []; return name !== n || !h ? [`${n} (file ${i + 1}): its bytes weren't hashed`] : h !== sent.get(n) ? [`${n} (file ${i + 1}): not byte-identical to the sender's`] : []; });
}

// The runner's guard on a scenario the agent wrote: every expected text must be one of the ticket's
// quoted strings (or the part of one before a " · "), so it can't have come from the code. Quote
// styles count as the same and numbers may differ: the skill tells the agent to use the numbers its
// scenario produces ("Downloading 3" for the ticket's "Downloading 10"). It proves the text came from
// the ticket, not that it is the right line of it: the check's `source` and the skill cover that.
// Spaces inside the text are kept: the checker compares them exactly (Qodo on #148).
const shape = (t) => plainQuotes(t).replace(/\d+/g, '#');
// A quote the ticket rules out ("not", "never", "instead of" or "rather than" right before it) can't
// be expected text, and that wins over the same text quoted elsewhere: #72 says 'The message says
// "Downloading 10", not "Saved 10"' and also gives "Saved 10 · 2 still arriving" as an example
// (owner's review of #148).
const RULED_OUT = /\b(not|never|instead of|rather than)\s*$/i;
export function ticketQuotes(body) {
  const text = plainQuotes(body), allowed = new Set(), ruledOut = new Map();
  for (const m of text.matchAll(/"([^"\n]{1,300})"/g)) {
    const q = m[1], before = text.slice(Math.max(0, m.index - 20), m.index);
    if (RULED_OUT.test(before)) { ruledOut.set(shape(q), q); continue; }
    allowed.add(shape(q)); allowed.add(shape(q.split(' · ')[0]));
  }
  for (const k of ruledOut.keys()) allowed.delete(k);
  return Object.assign(allowed, { ruledOut });
}
export function ticketTextProblems(scenario, body) {
  // a malformed scenario is refused here, never a crash (Qodo on #148)
  if (!scenario || typeof scenario !== 'object' || !Array.isArray(scenario.steps)) return ['the scenario has no list of steps'];
  const quotes = ticketQuotes(body);
  return scenario.steps.flatMap((st, i) => {
    if (!st || typeof st !== 'object') return [`step ${i} isn't an object`];
    if (st.check === 'toast' && typeof st.equals !== 'string') return [`step ${i}: a toast check has no expected text`];   // Qodo on #148
    if (typeof st.equals !== 'string') return [];
    const k = shape(st.equals), lead = shape(st.equals.split(' · ')[0]);
    if (quotes.ruledOut.has(lead) && !quotes.ruledOut.has(k)) return [`"${st.equals}" (device ${st.device}): the ticket rules out its first part ("${quotes.ruledOut.get(lead)}" follows a "not", "never", "instead of" or "rather than")`];
    if (quotes.ruledOut.has(k)) return [`"${st.equals}" (device ${st.device}): the ticket rules it out ("${quotes.ruledOut.get(k)}" follows a "not", "never", "instead of" or "rather than")`];
    return quotes.has(k) ? [] : [`"${st.equals}" (device ${st.device}) isn't quoted in the ticket`];
  });
}
