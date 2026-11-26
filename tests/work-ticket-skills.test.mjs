// work-ticket uses the two Day 13 skills: flake-or-regression when a browser test fails, and
// group-device-check before a ui or sharing ticket is called done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const file = (p) => new URL(`../${p}`, import.meta.url);
const skill = () => readFileSync(file('.claude/skills/work-ticket/SKILL.md'), 'utf8');
// the text of one numbered step, from its heading to the next "## "
const step = (n) => { const s = skill(), i = s.indexOf(`\n## ${n}.`); assert.ok(i >= 0, `no step ${n}`); const j = s.indexOf('\n## ', i + 1); return s.slice(i, j < 0 ? undefined : j); };
const unattended = () => { const s = skill(), i = s.indexOf('\n## Unattended runs'); return s.slice(i, s.indexOf('\n## ', i + 1)); };

test('both skills the work-ticket skill names exist', () => {
  assert.ok(existsSync(file('.claude/skills/flake-or-regression/SKILL.md')));
  assert.ok(existsSync(file('.claude/skills/group-device-check/SKILL.md')));
});

test('a failing browser test goes to flake-or-regression before any fix or stop', () => {
  const s = step(4);
  assert.match(s, /flake-or-regression/);
  assert.match(s, /before you (fix|change) anything or stop/i);
  assert.match(s, /inconclusive/);   // an inconclusive verdict is reported, never read as "not this branch"
});

test('a ui or sharing ticket is checked with group-device-check before it is called done', () => {
  const s = step(4);
  assert.match(s, /group-device-check/);
  assert.match(s, /area: ui/); assert.match(s, /area: sharing/);
  assert.match(s, /STOP is never a pass/);
  assert.match(s, /PASS on what was checked/);
});

test('the PR description carries both results', () => {
  const s = step(6);
  assert.match(s, /group-device-check/); assert.match(s, /flake-or-regression/);
});

test('an unattended run names the skills for the owner instead of running them', () => {
  const s = unattended();
  assert.match(s, /flake-or-regression/); assert.match(s, /group-device-check/);
  assert.match(s, /can't run (them|either)/i);
});

// Qodo on #147 (162e35b)
test('#147 50c924fd: "already flaky" with more branch hits than main goes to the owner, not straight on', () => {
  const s = step(4);
  assert.match(s, /hit it more often than main/);
  assert.match(s, /- \[ \]/);
});
test('#147 e5c52867: an unattended run never fixes a browser step it didn\'t write, and an unrun device check is an unticked box', () => {
  const s = unattended();
  assert.match(s, /don't fix it and don't decide whose it is/i);
  // superseded by the runner running the device check itself (owner's decision, 26 Nov): the agent
  // writes the scenario; anything it can't check becomes an unticked box through the runner's proof
  assert.match(s, /\.agent\/scenario\.json/);
  assert.match(s, /"notChecked"/);
});
test('#147 f3cc8324 (Low, settled by e5c52867): the Not checked items go to one place, as unticked boxes under Notes', () => {
  assert.match(step(4), /each item on that list goes under Notes as an unticked `- \[ \]`/);
  assert.doesNotMatch(step(6), /and its Not checked list\) under Tested/);
});
