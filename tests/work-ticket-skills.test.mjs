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
