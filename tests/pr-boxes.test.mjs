// #151: the PR description shows each unticked box once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as lib from '../scripts/runner-lib.mjs';   // a namespace: a missing helper fails on an assertion, not the import

const oneBoxEach = (body) => { assert.equal(typeof lib.oneBoxEach, 'function', 'runner-lib exports oneBoxEach'); return lib.oneBoxEach(body); };
const boxes = (body) => body.split('\n').filter((l) => /^\s*[-*]\s*\[ \]/.test(l)).map((l) => l.replace(/^\s*[-*]\s*\[ \]\s*/, '').trim());

const device = (sha, items) => `**Device check (group-device-check), run by the runner** on \`${sha}\`: **PASS on what was checked**, 2 check points.\n\n| Step | Check |\n|---|---|\n| 1 | text |\n\n${items.map((i) => `- [ ] ${i}`).join('\n')}`;
const push = (from, to, dev) => `**Red → green, checked by the runner** (not the agent) for ${from}..${to}:\n- \`${to}\` (head): \`npm test\` **passes**.\n\n${dev}`;
const PHONES = 'Checked on real phones (iPhone and Android): the device check uses headless browser windows and a stand-in share sheet';
const notes = `Closes #72\n\n## Notes\n- [ ] Not checked: "N still arriving" (the script can't hold a transfer)\n- [ ] ${PHONES}\n- [ ] Check the toast on a laptop with a share sheet`;
const body = [notes,
  push('main', 'f857768', device('f857768', ['Not checked: "N still arriving" (the script can\'t hold a transfer)', 'Not checked: the 12-photo size', PHONES])),
  '**Blind review** of f857768: 0 findings.',
  push('f857768', '1fd6967', device('1fd6967', ['Not checked: "N still arriving" (the script can\'t hold a transfer)', PHONES]))].join('\n\n');

test('two device-check proofs and the agent\'s Notes listing the same item show each box once', () => {
  const out = boxes(oneBoxEach(body));
  assert.deepEqual([...out].sort(), [
    'Check the toast on a laptop with a share sheet',
    PHONES,
    'Not checked: "N still arriving" (the script can\'t hold a transfer)',
  ].sort());
});

test('an earlier head\'s device-check table stays as history, its boxes as plain text', () => {
  const out = oneBoxEach(body);
  assert.match(out, /on `f857768`/);
  assert.match(out, /^- .*the 12-photo size/m, 'the earlier box is still there as text');
  assert.ok(!boxes(out).some((b) => b.includes('12-photo size')), 'but not as a checkbox');
});

test('the latest device-check proof keeps its own boxes', () => {
  const out = oneBoxEach(body);
  const latest = out.slice(out.lastIndexOf('**Device check (group-device-check)'));
  assert.deepEqual(boxes(latest), ['Not checked: "N still arriving" (the script can\'t hold a transfer)', PHONES]);
});

test('a description with no device check is unchanged', () => {
  const plain = 'Closes #9\n\n- [ ] one\n- [x] done\n- [ ] two';
  assert.equal(oneBoxEach(plain), plain);
});

test('needs-manual-check still sees the latest proof and the agent\'s own boxes', () => {
  const src = readFileSync(new URL('../scripts/agent-watch.mjs', import.meta.url), 'utf8');
  assert.match(src, /const prBody = \(n, s\) => shown\(oneBoxEach\(/, 'prBody, which uncheckedCriteria reads, goes through oneBoxEach');
  assert.equal(boxes(oneBoxEach(body)).length, 3);
});
