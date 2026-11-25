import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenarioProblems, sameText, verdict, joinProblems, MAX_DEVICES } from '../scripts/group-check-lib.mjs';

const ok = { ticket: 72, devices: [{ size: 'laptop' }, { size: 'phone', share: 'fail-once' }], steps: [{ do: 'tap', device: 1, selector: '#saveall' }, { check: 'toast', device: 1, equals: 'Downloading 3', source: '#72 Decisions: Downloads' }] };

test('a scenario names its ticket, at least 2 devices of known sizes and steps', () => {
  assert.deepEqual(scenarioProblems(ok), []);
  assert.match(scenarioProblems({ ...ok, ticket: undefined }).join(), /ticket/);
  assert.match(scenarioProblems({ ...ok, devices: [{ size: 'laptop' }] }).join(), /at least 2/);
  assert.match(scenarioProblems({ ...ok, devices: [{ size: 'watch' }, { size: 'phone' }] }).join(), /size must be/);
  assert.match(scenarioProblems({ ...ok, devices: Array(MAX_DEVICES + 1).fill({ size: 'phone' }) }).join(), /more than 20/);
  assert.match(scenarioProblems({ ...ok, steps: [] }).join(), /steps/);
});

test('every check says which ticket section its expected text came from, and never the code', () => {
  const noSource = { ...ok, steps: [{ check: 'toast', device: 1, equals: 'Downloading 3' }] };
  assert.match(scenarioProblems(noSource).join(), /needs "source"/);
  const fromCode = { ...ok, steps: [{ check: 'toast', device: 1, equals: 'Downloading 3', source: 'web/saveall.js:51' }] };
  assert.match(scenarioProblems(fromCode).join(), /points at code/);
});

test('text matches exactly, except curly and straight quotes count as the same', () => {
  assert.ok(sameText("Couldn't open the share sheet", 'Couldn’t open the share sheet'));
  assert.ok(sameText('Downloading 3', ' Downloading 3 '));
  assert.ok(!sameText('Downloading 3', 'Saved 3'));
  assert.ok(!sameText('Shared 10 · 2 still arriving', 'Shared 10 - 2 still arriving'));
});

test('the verdict: a stop beats a fail, a fail beats a pass, no check points is a stop', () => {
  assert.equal(verdict([]).state, 'stop');
  assert.equal(verdict([{ state: 'pass' }, { state: 'pass' }]).state, 'pass');
  assert.equal(verdict([{ state: 'pass' }, { step: 3, check: 'toast', state: 'fail', expected: 'a', actual: 'b' }]).state, 'fail');
  assert.equal(verdict([{ step: 1, state: 'fail' }, { step: 2, state: 'stop', why: 'no room server' }]).state, 'stop');
});

test('every device must see the others and be in its share of the chain of joins', () => {
  const three = [{ devices: 3, joinsTotal: 2, joinsMine: 1 }, { devices: 3, joinsTotal: 2, joinsMine: 2 }, { devices: 3, joinsTotal: 2, joinsMine: 1 }];
  assert.deepEqual(joinProblems(three), []);
  const leftOut = [{ devices: 2, joinsTotal: 1, joinsMine: 1 }, { devices: 2, joinsTotal: 1, joinsMine: 1 }, { devices: 1, joinsTotal: 0, joinsMine: 0 }];
  assert.ok(joinProblems(leftOut).length >= 3);
});
