import test from 'node:test';
import assert from 'node:assert/strict';
import { scopePlan } from '../../scripts/runner-lib.mjs';

// assertionRed rejects any output that mentions "SyntaxError" anywhere, so a repro that fails on a real
// assertion whose message or diff mentions a SyntaxError (e.g. a finding about JSON.parse of a reply)
// is classed as not reproduced on the branch, and as "can't load" (so "introduced") on main.
const R = '.agent/scope/f1.test.mjs';
const e = { id: 'f1', repro: R, acceptance: false, owner: '#24' };
const red = { ok: false, out: "not ok 1 - bad reply\n  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n+ actual - expected\n+ 'SyntaxError: Unexpected token o in JSON'\n- 'ok'" };

test('a real assertion failure whose message mentions SyntaxError counts as red on the branch', () => {
  const p = scopePlan(['f1'], { entries: [e] }, { [R]: red }, { [R]: { ok: true, out: 'ok 1' } });
  assert.deepEqual(p.fix, ['f1']);
  assert.deepEqual(p.unproven, []);
});

test('the same failure on main and the branch is pre-existing, so deferred', () => {
  const p = scopePlan(['f1'], { entries: [e] }, { [R]: red }, { [R]: red });
  assert.equal(p.defer[0]?.id, 'f1');
});
