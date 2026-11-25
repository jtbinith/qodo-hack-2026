// Pure helpers for scripts/flake-or-regression.mjs (the flake-or-regression skill), unit tested
// in tests/flake-lib.test.mjs. The decision rule is fixed here, before any run, and never tuned to
// a result.

export const MAX_K = 30;

// One run's outcome from its exit code and output: "hit" if the output has the failure's signature
// (whatever else happened), "other" for any other failure, "error" if the test couldn't start or
// run (the browser or the server), "pass" otherwise.
export function classify(exit, output, signature) {
  const out = String(output || '');
  if (signature && out.includes(signature)) return 'hit';
  if (/Executable doesn't exist|EADDRINUSE|Cannot find module|browserType\.launch|ERR_MODULE_NOT_FOUND/.test(out)) return 'error';
  if (exit === 0) return 'pass';
  return 'other';
}

// A run the machine slept through: wall-clock time ran on while the monotonic clock (and with it
// node's timers, including the runner's timeout) stood still. Its output says nothing about the
// code, so it's "paused": not counted, and the runner runs that slot again. Found by fresh run 1
// (case C, run 16: 1724 s for an ~85 s test, counted as "other failure").
export const PAUSE_MS = 30000;
// A run the runner killed for taking too long couldn't run: that's the harness, not the test (the
// test's own waits are 90 s at most).
export function outcomeOf({ exit, output, signature, timedOut = false, wallMs = 0, monoMs = 0 }) {
  if (wallMs - monoMs > PAUSE_MS) return 'paused';
  if (timedOut) return 'error';
  return classify(exit, output, signature);
}

// The first line that says what failed: a FAIL line or a timeout, for the run table.
export const firstFailure = (output) => (String(output || '').split('\n').find((l) => /^FAIL |timed out after|Error:/.test(l)) || '').slice(0, 200);

// The rule, from how often each side hit the signature in K runs each:
//   already flaky   main hit at least once, and the branch's rate is no more than double main's
//   branch broke it main never hit, the branch hit at least 3 times
//   made worse      both hit, and the branch's rate is at least 3 times main's
//   inconclusive    anything else, including neither side hitting it: stop and report, don't guess
// Runs that errored or were paused don't count as either; with fewer than K usable runs on a side it's inconclusive.
export function decide({ k, main, branch }) {
  const usable = (s) => s.hit + s.pass + s.other;
  if (usable(main) !== k || usable(branch) !== k) return { verdict: 'inconclusive', why: `fewer than ${k} usable runs on a side (main ${usable(main)}, branch ${usable(branch)})` };
  // both sides have K usable runs, so rates compare as whole counts (no floating point)
  if (main.hit >= 1 && branch.hit <= 2 * main.hit) return { verdict: 'already flaky', why: `main hit it ${main.hit} of ${k}, the branch ${branch.hit} of ${k} (no more than double)` };
  if (main.hit === 0 && branch.hit >= 3) return { verdict: 'branch broke it', why: `main never hit it in ${k} runs, the branch hit it ${branch.hit} of ${k}` };
  if (main.hit >= 1 && branch.hit >= 3 * main.hit) return { verdict: 'made worse', why: `main hit it ${main.hit} of ${k}, the branch ${branch.hit} of ${k} (at least 3 times as often)` };
  return { verdict: 'inconclusive', why: `main hit it ${main.hit} of ${k}, the branch ${branch.hit} of ${k}: the rule doesn't decide this` };
}

// The order of runs: alternate main and branch, so the machine's load falls on both evenly.
export const order = (k) => Array.from({ length: 2 * k }, (_, i) => (i % 2 ? 'branch' : 'main'));
