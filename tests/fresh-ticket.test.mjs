// A reopened run reads the ticket from GitHub again and gets its own local fix rounds. Found by the
// factory's first device-check run on #72 (26 Nov): its .agent/ticket.md was the 23 Nov copy (no new
// Decision, the old line-10 example), and #72's 2 local rounds from 23 Nov were already used up, so
// the agent got no round for Qodo's new High.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as lib from '../scripts/group-check-lib.mjs';

const src = () => readFileSync(new URL('../scripts/agent-watch.mjs', import.meta.url), 'utf8');
const fnOf = (name) => { const s = src(), i = s.indexOf(`function ${name}(`); assert.ok(i >= 0, `no function ${name}`); return s.slice(i, s.indexOf('\n}\n', i)); };
// the code of a reopen path, from its event line back to the start of its loop
const reopenPath = (marker) => { const s = src(), j = s.indexOf(marker); assert.ok(j >= 0, marker); const i = s.lastIndexOf('for (const { number: n }', j); return s.slice(i, s.indexOf('process.exit(0);', j)); };
const PATHS = ['reopened by an /agent comment on PR', 'resumed by /agent retry on the ticket'];

test('freshTicket writes .agent/ticket.md from the ticket as GitHub has it now', () => {
  const f = fnOf('freshTicket');
  assert.match(f, /issue\(n\)/);
  assert.match(f, /putAgentFile\(s, 'ticket\.md'/);
});
test('the first pickup and both ways of reopening a run write the ticket afresh, before the agent runs', () => {
  for (const p of PATHS) {
    const code = reopenPath(p);
    assert.match(code, /freshTicket\(n, s\)/, p);
    assert.ok(code.indexOf('freshTicket(n, s)') < code.search(/continueRun\(n, s\)|checkAndPush\(n, s/), `${p}: before the agent runs`);
  }
  const s = src(), pick = s.slice(s.indexOf("const ready = openTickets(L.ready)"));
  assert.ok(pick.indexOf('freshTicket(n, s)') >= 0 && pick.indexOf('freshTicket(n, s)') < pick.indexOf("wisdomCheck(n, s)"));
});
test('a stale copy of the ticket is never written: the pickup has no inline ticket.md of its own', () => {
  const s = src();
  assert.equal((s.match(/putAgentFile\(s, 'ticket\.md'/g) || []).length, 2);   // freshTicket, and the Wisdom check putting back the runner's copy
});
test('the guard reads the live ticket, never the agent\'s copy', () => {
  const f = fnOf('deviceCheck');
  assert.match(f, /issue\(n\)/);
  assert.doesNotMatch(f, /agentFile\(s, 'ticket\.md'\)/);
});
test('an owner round gets its own local fix rounds: both reopen paths reset the count', () => {
  for (const p of PATHS) assert.match(reopenPath(p), /s\.localRounds = 0/, p);
});

// Optional (owner's note): a stand-in share sheet that hangs past SHARE_TIMEOUT and settles later,
// so the check can cover Qodo's High ("Settled sheets still force downloads") instead of listing it
test('a stand-in share sheet can hang, then settle', () => {
  const base = { ticket: 72, steps: [{ do: 'pause', ms: 1 }] };
  for (const share of ['hang-then-works', 'hang-then-cancel']) assert.deepEqual(lib.scenarioProblems({ ...base, devices: [{ size: 'laptop' }, { size: 'phone', share, hangMs: 65000 }] }), [], share);
  assert.match(lib.scenarioProblems({ ...base, devices: [{ size: 'laptop' }, { size: 'phone', share: 'hang-then-works' }] }).join(), /hangMs/);
  const runner = readFileSync(new URL('../scripts/group-check.mjs', import.meta.url), 'utf8');
  assert.match(runner, /hang-then-/);
  assert.match(runner, /AbortError/);
});

// Qodo on #149 (b494781)
test('#149 8437ce20: a second share while the stand-in sheet hangs is refused, as a browser does', () => {
  const runner = readFileSync(new URL('../scripts/group-check.mjs', import.meta.url), 'utf8');
  assert.match(runner, /InvalidStateError/);
  assert.match(runner, /if \(open\) throw new DOMException/);
});
test('#149 ede3c67f deferred to #150: reopening doesn\'t run the Wisdom check in the run\'s worktree (it\'s the feature branch, not main: 9dc75a28)', () => {
  for (const p of PATHS) assert.doesNotMatch(reopenPath(p), /wisdomCheck\(n, s\)/, p);
  for (const p of PATHS) assert.match(reopenPath(p), /\n    freshTicket\(n, s\);/, p);
});
