import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The design-question stop now runs before the "ticket is wrong about the code" stop. When Wisdom
// finds both, the owner is told only the questions, answers them, relabels, and a fresh run (a new
// Wisdom call) then stops on the wrong claims it already knew about. The design stop should also
// list w.wrong when w.state is 'stop'.
test('a design stop also reports the claims Wisdom proved wrong', () => {
  const src = readFileSync(new URL('../../scripts/agent-watch.mjs', import.meta.url), 'utf8');
  const line = src.split('\n').find((l) => l.includes('if (dq.blocking.length)'));
  assert.ok(line, 'design stop found');
  assert.match(line, /w\.wrong/, 'the design stop message leaves out the wrong claims');
});
