import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, firstFailure, decide, order } from '../scripts/flake-lib.mjs';

const S = 'timed out after 90 s at two-browser.mjs:229';
const side = (hit, pass, other = 0) => ({ hit, pass, other, error: 0 });

test('a run hits only if its output has the signature; other failures and errors are told apart', () => {
  assert.equal(classify(1, `PASS a\n${S}: until(B…`, S), 'hit');
  assert.equal(classify(1, 'FAIL something else', S), 'other');
  assert.equal(classify(0, 'PASS all', S), 'pass');
  assert.equal(classify(1, "browserType.launch: Executable doesn't exist", S), 'error');
  assert.equal(firstFailure('PASS a\nFAIL b went wrong\nFAIL c'), 'FAIL b went wrong');
});

test('the rule: already flaky, branch broke it, made worse, otherwise inconclusive', () => {
  assert.equal(decide({ k: 10, main: side(1, 9), branch: side(2, 8) }).verdict, 'already flaky');
  assert.equal(decide({ k: 10, main: side(0, 10), branch: side(3, 7) }).verdict, 'branch broke it');
  assert.equal(decide({ k: 10, main: side(1, 9), branch: side(3, 7) }).verdict, 'made worse');
  assert.equal(decide({ k: 10, main: side(0, 10), branch: side(0, 10) }).verdict, 'inconclusive');
  assert.equal(decide({ k: 10, main: side(0, 10), branch: side(2, 8) }).verdict, 'inconclusive');
  assert.equal(decide({ k: 10, main: side(2, 8), branch: side(5, 5) }).verdict, 'inconclusive');   // 2.5x: between the bands
});

test('a delay that makes a flake more common is never called "already flaky"', () => {
  assert.notEqual(decide({ k: 10, main: side(1, 9), branch: side(4, 6) }).verdict, 'already flaky');
});

test('errored runs do not count; fewer than K usable runs on a side is inconclusive', () => {
  assert.equal(decide({ k: 5, main: side(1, 3), branch: side(1, 4) }).verdict, 'inconclusive');
});

test('runs alternate main and branch', () => {
  assert.deepEqual(order(2), ['main', 'branch', 'main', 'branch']);
});

// Fresh run 1, case C, run 16: the laptop slept mid-run (1724 s for an ~85 s test). Node's timers
// stop during sleep, so the 10-minute timeout never fired and the run counted as "other failure".
import * as lib from '../scripts/flake-lib.mjs';
const outcomeOf = (r) => lib.outcomeOf(r);
const runner = () => readFileSync(new URL('../scripts/flake-or-regression.mjs', import.meta.url), 'utf8');
const skill = () => readFileSync(new URL('../.claude/skills/flake-or-regression/SKILL.md', import.meta.url), 'utf8');

test('a run the machine slept through is "paused", whatever its output says', () => {
  assert.equal(outcomeOf({ exit: 1, output: 'FAIL 20 needs listing every piece', signature: S, wallMs: 1724000, monoMs: 85000 }), 'paused');
  assert.equal(outcomeOf({ exit: 1, output: `${S}`, signature: S, wallMs: 1724000, monoMs: 85000 }), 'paused');
  assert.equal(outcomeOf({ exit: 1, output: 'FAIL x', signature: S, wallMs: 86000, monoMs: 85000 }), 'other');
  assert.ok(lib.PAUSE_MS >= 10000 && lib.PAUSE_MS <= 60000);
});

test('a run killed by the runner\'s timeout couldn\'t run: it is not a test failure', () => {
  assert.equal(outcomeOf({ exit: null, output: 'PASS a', signature: S, timedOut: true, wallMs: 600000, monoMs: 600000 }), 'error');
});

test('paused runs are run again and never counted', () => {
  assert.equal(decide({ k: 3, main: { hit: 0, pass: 3, other: 0, error: 0, paused: 2 }, branch: side(0, 3) }).verdict, 'inconclusive');
  assert.match(runner(), /outcomeOf\(/);
  assert.match(runner(), /'paused'/);
  assert.match(runner(), /process\.hrtime\.bigint\(\)/);
});

test('the skill says what to do when the given output is from an older version of the test', () => {
  assert.match(skill(), /older version of the test/);
});
