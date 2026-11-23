// checkAndPush stops at LIMITS.localRounds without resetting s.localRounds (it is reset only after a
// successful push). The saved count then outlives the stop: the owner's next `/agent …` round (or
// `/agent retry`) goes back through checkAndPush, and the first High or Medium from the local review
// stops the run at once ("still open after 2 local rounds") with no fix round for the new work.
// Nothing can push, so nothing ever resets it: the PR is stuck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../scripts/agent-watch.mjs', import.meta.url), 'utf8');

// a tiny model of the runner's local-round logic, taken from the source: does a fresh owner round get any local fix round?
test('after a local-review stop, an owner round gets its own local fix rounds', () => {
  const limitLine = src.split('\n').find((l) => /s\.localRounds \|\| 0\) >= LIMITS\.localRounds/.test(l)) || '';
  const resetOnStop = /localRounds\s*=\s*0/.test(limitLine);
  const owner = src.match(/const told = asked\.filter[\s\S]*?checkAndPush\(n, s, 'owner comment'\)/)?.[0] || '';
  const retry = src.match(/if \(!told\.length\) \{[\s\S]*?continue;/)?.[0] || '';
  const resetOnOwner = /localRounds\s*=\s*0/.test(owner) && /localRounds\s*=\s*0/.test(retry);
  const resetAtStart = /function continueRun[\s\S]{0,200}localRounds\s*=\s*0/.test(src);
  // simulate: a run stopped at the limit, then the owner asks for a change that has one Medium
  let localRounds = 2; const LIMIT = 2;
  if (resetOnStop || resetOnOwner || resetAtStart) localRounds = 0;
  const stoppedWithoutAFixRound = localRounds >= LIMIT;
  assert.equal(stoppedWithoutAFixRound, false, 's.localRounds stays at the limit after a stop, so every later owner round stops at its first local finding');
});
