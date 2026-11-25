import { test } from 'node:test';
import assert from 'node:assert/strict';
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
