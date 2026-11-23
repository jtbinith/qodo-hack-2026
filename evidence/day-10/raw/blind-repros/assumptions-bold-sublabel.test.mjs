import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../scripts/agent-watch.mjs', import.meta.url), 'utf8');
const line = src.split('\n').find((l) => l.startsWith('const assumptions = '));
const assumptions = new Function(`return ${line.replace(/^const assumptions = /, '').replace(/;\s*\/\/.*$/, '')}`)();

// Regression: a "## Assumptions" heading section was read whole before this change. The new
// bold-line terminator now cuts it at the first bold-only sub-label inside it, so the stop comment
// and the PR's "agent's choices" lose everything under that label.
test('a bold sub-label inside a ## Assumptions section does not end the section', () => {
  const report = '# Ticket #72\n\n## Assumptions\n**Handed-over design questions**\n- Toast shows for 3 s\n- Downloads 300 ms apart\n\n## Proof\n- npm test\n';
  assert.match(assumptions(report), /Toast shows for 3 s/);
});
