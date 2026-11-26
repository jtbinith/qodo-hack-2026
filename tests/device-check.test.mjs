// The runner runs group-device-check itself for ui and sharing tickets, from a scenario the agent
// writes. Its guard: every expected text must be quoted in the ticket, so a scenario can't take its
// expected text from the code (the mistake the skill exists to prevent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as lib from '../scripts/group-check-lib.mjs';

const ticket = `- **Downloads:** The message says "Downloading 10", not "Saved 10".
- **When the message shows:** It says "Shared 10 · 2 still arriving".
- **Failure:** a toast says "Couldn't open the share sheet. Tap Save all again to download".`;
const scen = (...equals) => ({ ticket: 72, devices: [{ size: 'laptop' }, { size: 'phone' }], steps: equals.map((e) => ({ check: 'toast', device: 1, equals: e, source: '#72 Decisions' })) });
const problems = (s) => lib.ticketTextProblems(s, ticket);

test('a made-up toast is refused', () => {
  assert.equal(typeof lib.ticketTextProblems, 'function');
  assert.match(problems(scen('Photos saved!')).join(), /Photos saved!/);
});
test('loose words from a sentence are refused: only the ticket\'s quoted text counts', () => {
  assert.ok(problems(scen('The message says')).length);
  assert.ok(problems(scen('Tap Save all again')).length);
});
test('the ticket\'s quoted text is accepted, with its numbers changed and quote styles mixed', () => {
  assert.deepEqual(problems(scen('Downloading 3', 'Shared 1', 'Couldn’t open the share sheet. Tap Save all again to download')), []);
  assert.deepEqual(problems(scen('Shared 3 · 1 still arriving')), []);
});
test('a word changed in quoted text is refused', () => {
  assert.ok(problems(scen('Downloaded 3')).length);
  assert.ok(problems(scen("Couldn't open the share sheet. Tap Save all to download")).length);
});
test('checks without expected text (shared, downloads) need nothing from the ticket', () => {
  const s = { ...scen(), steps: [{ check: 'downloads', device: 0, count: 3, source: '#72' }, { check: 'shared', device: 1, calls: 2, source: '#72' }] };
  assert.deepEqual(problems(s), []);
});

const runner = () => readFileSync(new URL('../scripts/agent-watch.mjs', import.meta.url), 'utf8');
test('the runner checks the scenario against the ticket before it runs anything, and a refusal is an error, not a pass', () => {
  const src = runner();
  assert.match(src, /ticketTextProblems\(/);
  assert.ok(src.indexOf('ticketTextProblems(scenario') < src.indexOf("spawnSync(SANDBOX, ['node', join(rc, 'group-check.mjs')"), 'the guard comes before the run');   // the run moved into the container with 4d86635f
  assert.match(src, /throw new Stop\(`The scenario's expected text isn't quoted in #/);
});
test('the runner runs the device check only for area: ui and area: sharing tickets, after npm test passes', () => {
  const src = runner();
  assert.match(src, /DEVICE_LABELS = \['area: ui', 'area: sharing'\]/);
  assert.ok(src.indexOf('const device = deviceCheck(n, s)') > src.indexOf('if (t.ok) break;'));
});
test('PASS goes in the PR\'s proof, FAIL goes back to the agent, STOP stops the run', () => {
  const src = runner();
  assert.match(src, /\*\*Device check \(group-device-check\), run by the runner\*\*/);
  assert.match(src, /agent\(n, s, 'fix-device'/);
  assert.match(src, /throw new Stop\(`The device check stopped/);
});
test('the work-ticket skill tells an unattended agent to write the scenario, quoting the ticket', () => {
  const skill = readFileSync(new URL('../.claude/skills/work-ticket/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /\.agent\/scenario\.json/);
  assert.match(skill, /quoted in the ticket/);
});
test('a quote the ticket rules out ("not", "never", "instead of", "rather than") is refused, naming it', () => {
  // #72: 'The message says "Downloading 10", not "Saved 10"' (the hole: "Saved 3" used to pass)
  const p = problems(scen('Saved 3'));
  assert.ok(p.length);
  assert.match(p.join(), /Saved 10/);
  for (const word of ['never', 'instead of', 'rather than']) assert.ok(lib.ticketTextProblems(scen('Saved 3'), `It says "Downloading 10" ${word} "Saved 10".`).length, word);
});
test('a ruled-out quote wins over the same text quoted as an example elsewhere', () => {
  const t = `For example "Saved 10 · 2 still arriving". The message says "Downloading 10", not "Saved 10".`;
  assert.match(lib.ticketTextProblems(scen('Saved 3'), t).join(), /Saved 10/);
});
test('"Downloading 3" is still accepted', () => {
  assert.deepEqual(problems(scen('Downloading 3')), []);
});
test('the "Not checked" boxes in the runner\'s device proof also set needs-manual-check', () => {
  assert.match(runner(), /uncheckedCriteria\(prBody\(n, s\)\)/);
});

// Qodo on #148 (c41dc71)
test('#148 4d86635f: the device check runs in the same throwaway container as npm test, never on the host', () => {
  const src = runner(), fn = src.slice(src.indexOf('function deviceCheck('), src.indexOf('function checkAndPush('));
  assert.match(fn, /spawnSync\(SANDBOX, \['node', /);
  assert.doesNotMatch(fn, /spawnSync\('node'/);
});
test('#148 8c5661fb: a toast check without expected text is refused, so an empty toast can\'t pass', () => {
  const s = { ...scen(), steps: [{ check: 'toast', device: 1, source: '#72' }] };
  assert.ok(problems(s).length);
  assert.match(lib.scenarioProblems(s).join(), /toast check needs "equals"/);
  assert.ok(problems({ ...scen(), steps: [{ check: 'toast', device: 1, equals: null, source: '#72' }] }).length);
});
test('#148 d08960b0: a headless pass always leaves the real-phone check as an unticked box', () => {
  assert.match(runner(), /- \[ \] Checked on real phones/);
});
test('#148 40d1bde0: a malformed scenario is refused, never a crash', () => {
  assert.doesNotThrow(() => lib.ticketTextProblems(null, ticket));
  assert.ok(lib.ticketTextProblems(null, ticket).length);
  assert.doesNotThrow(() => lib.ticketTextProblems({ steps: [null] }, ticket));
  assert.ok(lib.ticketTextProblems({ steps: [null] }, ticket).length);
  assert.match(runner(), /scenarioProblems\(scenario\)/);
});
test('#148 13cc7d6e: a one-character quoted message is accepted', () => {
  assert.deepEqual(lib.ticketTextProblems(scen('0'), 'It shows "0" when empty.'), []);
});
test('#148 75ba6d73: changed spacing is refused, as the checker compares it exactly', () => {
  assert.ok(problems(scen('Downloading  3')).length);
});
