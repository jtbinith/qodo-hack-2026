import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as lib from '../scripts/group-check-lib.mjs';
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

test('a shared check needs a call count, and the file count is optional', () => {
  const base = { ticket: 72, devices: [{ size: 'laptop' }, { size: 'phone', share: 'works' }] };
  assert.deepEqual(scenarioProblems({ ...base, steps: [{ check: 'shared', device: 1, calls: 2, source: '#72 Decisions' }] }), []);
  assert.match(scenarioProblems({ ...base, steps: [{ check: 'shared', device: 1, source: '#72 Decisions' }] }).join(), /needs "calls"/);
});

// Qodo on #145
const runner = () => readFileSync(new URL('../scripts/group-check.mjs', import.meta.url), 'utf8');
const skill = () => readFileSync(new URL('../.claude/skills/group-device-check/SKILL.md', import.meta.url), 'utf8');
test('#145 27321b84: a "joined" check is not accepted, because the runner checks joins itself', () => {
  const s = { ticket: 72, devices: [{ size: 'laptop' }, { size: 'phone' }], steps: [{ check: 'joined', device: 1, source: '#72' }] };
  assert.match(scenarioProblems(s).join(), /unknown check "joined"/);
});
test('#145 d39a1b24: the server serves only files whose real path is inside web/', () => {
  assert.equal(typeof lib.insideRoot, 'function');
  assert.ok(lib.insideRoot('/b/web/', '/b/web/index.html'));
  assert.ok(!lib.insideRoot('/b/web/', '/home/someone/.ssh/id_rsa'));
  assert.ok(!lib.insideRoot('/b/web/', '/b/webby/x.js'));
  assert.match(runner(), /realpathSync\(f\)/);
});
test('#145 98244d32: a missing button is a recorded STOP for that build, not a crash', () => {
  assert.match(runner(), /page\.click\(st\.selector\)\.catch/);
});
test('#145 741051b7: the toast wait treats curly and straight quotes as the same, like the comparison', () => {
  assert.match(runner(), /replace\(\/\[‘’\]\/g, "'"\)/);
});
test('#145 dbd18078: a shared check compares the shared files\' bytes with what the sender holds', () => {
  assert.match(runner(), /crypto\.subtle\.digest/);
  assert.match(runner(), /sharedHashes/);
});
test('#145 ac96c3a2: the skill resolves a build to a commit id before using it in a command', () => {
  assert.match(skill(), /sha=\$\(git rev-parse --verify "/);
});
