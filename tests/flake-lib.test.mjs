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

test('a run killed by the runner\'s timeout is not a test failure: it is a hang (changed by 9308876e)', () => {
  assert.equal(outcomeOf({ exit: null, output: 'PASS a', signature: S, timedOut: true, wallMs: 600000, monoMs: 600000 }), 'hang');
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

// Qodo on #146 (2b16259)
test('#146 91c08d41: the signature counts only on a failure line, never on a PASS line', () => {
  const sig = 'tapping a print on your screen says';
  assert.equal(outcomeOf({ exit: 0, output: `PASS ${sig} "Receiving…"`, signature: sig }), 'pass');
  assert.equal(outcomeOf({ exit: 1, output: `PASS ${sig} "Receiving…"\nFAIL something else`, signature: sig }), 'other');
  assert.equal(outcomeOf({ exit: 1, output: `FAIL ${sig} "Receiving..."`, signature: sig }), 'hit');
  assert.equal(outcomeOf({ exit: 1, output: `FAIL timed out after 90 s at two-browser.mjs:229: try { ${S} } catch`, signature: S }), 'hit');
});
test('#146 8d430f60: each comparison gets its own new temporary folder; no fixed path is deleted', () => {
  assert.match(runner(), /mkdtempSync\(/);
  assert.doesNotMatch(runner(), /rmSync\(s\.dir/);
  assert.doesNotMatch(runner(), /`\/tmp\/for-\$\{name\}/);
});
test('#146 f2adccb3: a signature in one side\'s test but not the other\'s stops the comparison', () => {
  assert.equal(typeof lib.signatureProblem, 'function');
  const sig = 'await until(B, () => window.__t.files.size === 4, null, 90000);';
  const old = `try { ${sig} } catch {}`, edited = 'try { await until(B, () => window.__t.files.size === 4, null, 30000); } catch {}';
  assert.equal(lib.signatureProblem(sig, { main: old, branch: old }), null);
  assert.match(lib.signatureProblem(sig, { main: old, branch: edited }), /branch/);
  assert.equal(lib.signatureProblem('FAIL tapping a print on your screen says', { main: 'check(x, `tapping a print on your screen says "Receiving…"`)', branch: 'check(x, `tapping a print on your screen says "Receiving…"`)' }), null);   // "FAIL " is printed, not in the source
  assert.match(runner(), /signatureProblem\(/);
});
test('#146 73260a59: a stop removes the worktrees it made', () => {
  assert.match(runner(), /process\.on\('exit'/);
});
test('#146 09627b3c: different dependencies on the two sides stop the comparison', () => {
  assert.match(runner(), /package-lock\.json/);
  assert.match(runner(), /dependencies differ/);
});
test('#146 9308876e: a run killed for taking too long is a hang, counted per side, not "fix the setup"', () => {
  assert.equal(outcomeOf({ exit: null, output: 'PASS a', signature: S, timedOut: true, wallMs: 600000, monoMs: 600000 }), 'hang');
  assert.equal(decide({ k: 3, main: side(0, 3), branch: { hit: 0, pass: 2, other: 0, error: 0, hang: 1 } }).verdict, 'inconclusive');
  assert.match(runner(), /hung/);
});
test('#146 cae80b0c: a test that couldn\'t start or was killed by a signal couldn\'t run', () => {
  assert.equal(outcomeOf({ exit: null, output: '', signature: S, spawnError: 'ENOENT' }), 'error');
  assert.equal(outcomeOf({ exit: null, output: 'PASS a', signature: S, killedBy: 'SIGSEGV' }), 'error');
  assert.match(runner(), /spawnError: r\.error/);
});
test('#146 73260a59 (found checking the fix): Ctrl-C or a kill also removes the worktrees', () => {
  assert.match(runner(), /for \(const sig of \['SIGINT', 'SIGTERM', 'SIGHUP'\]\) process\.on\(sig/);
});
test('#146 dba5dfcb: a test run doesn\'t block the runner, so a signal stops the run in progress and the rest', () => {
  assert.doesNotMatch(runner(), /spawnSync\('node'/);
  assert.match(runner(), /await runTest\(/);
  assert.match(runner(), /current\?\.kill\('SIGKILL'\)/);
});
