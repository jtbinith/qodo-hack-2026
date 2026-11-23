import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../scripts/agent-watch.mjs', import.meta.url), 'utf8');
const line = src.split('\n').find((l) => l.startsWith('const assumptions = '));
const assumptions = new Function(`return ${line.replace(/^const assumptions = /, '').replace(/;\s*\/\/.*$/, '')}`)();

// A bold **Assumptions** section only ends at a bold-only line or a heading. The next bold section
// written with its text on the same line ("**Tests:** ...") is swallowed into the agent's choices
// that the PR description shows as its design decisions.
test('a bold Assumptions section ends at the next bold section label even with inline text', () => {
  const report = '**Assumptions**\n- Toast shows for 3 s\n\n**Tests:** npm run test:unit, 212 pass\n**Proof:** red at 1234567\n';
  assert.equal(assumptions(report), '- Toast shows for 3 s');
});
